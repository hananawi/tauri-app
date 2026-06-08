use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_http::reqwest;
use tauri_plugin_log::log;
use tokio::io::{AsyncBufReadExt, AsyncReadExt};

use crate::http_client::HttpClient;
use crate::ocr::{self, PixelRect};
use crate::state::AppState;

/// 一轮对话消息。前端把整个对话历史（含本次追问）作为 `messages` 传入，
/// 后端据此重建各 provider 的请求；首图只挂在第一条 user 消息上，
/// 后续追问保留同一图片上下文。`role` 取 "user" / "assistant"。
#[derive(serde::Deserialize)]
pub struct ChatTurn {
  pub role: String,
  pub text: String,
}

/// 构造 Anthropic `/v1/messages` 的 messages 数组：
/// 图片块只放在第一条消息里，其余轮次为纯文本。
fn build_anthropic_messages(messages: &[ChatTurn], image_b64: &str) -> Vec<Value> {
  messages
    .iter()
    .enumerate()
    .map(|(i, turn)| {
      let content = if i == 0 {
        json!([
          {
            "type": "image",
            "source": {
              "type": "base64",
              "media_type": "image/png",
              "data": image_b64
            }
          },
          { "type": "text", "text": turn.text }
        ])
      } else {
        json!([{ "type": "text", "text": turn.text }])
      };
      json!({ "role": turn.role, "content": content })
    })
    .collect()
}

/// 构造 OpenAI 兼容 `/chat/completions` 的 messages 数组：
/// 图片块（image_url）只放在第一条消息里，其余轮次为纯文本字符串内容。
fn build_openai_messages(messages: &[ChatTurn], data_url: &str) -> Vec<Value> {
  messages
    .iter()
    .enumerate()
    .map(|(i, turn)| {
      let content = if i == 0 {
        json!([
          { "type": "image_url", "image_url": { "url": data_url } },
          { "type": "text", "text": turn.text }
        ])
      } else {
        json!(turn.text)
      };
      json!({ "role": turn.role, "content": content })
    })
    .collect()
}

// base_url / auth_token 由前端从设置中读取并传入。
// idealab 网关仅支持 claude-opus-4-6 / claude-opus-4-7。
const LLM_MODEL: &str = "claude-opus-4-7";

// 下列常量复刻 Claude Code CLI 2.1.143 的请求 header，
// 让走 API 的请求与本机 `claude -p` 子进程发出的请求在 HTTP 层尽量一致，
// 便于复用同一套网关侧灰度/审计策略，也减少被后端按 header 区分对待的概率。
// 抓包方式：本地起 http 服务把 ANTHROPIC_BASE_URL 指过去，CC 走 Anthropic SDK
// （@stainless/anthropic），所有 x-stainless-* 都来自 SDK 自身。
const CC_USER_AGENT: &str = "claude-cli/2.1.143 (external, sdk-cli)";
const CC_ANTHROPIC_BETA: &str = "claude-code-20250219,oauth-2025-04-20,context-1m-2025-08-07,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advisor-tool-2026-03-01,effort-2025-11-24,afk-mode-2026-01-31,extended-cache-ttl-2025-04-11";
const CC_STAINLESS_PACKAGE_VERSION: &str = "0.94.0";
const CC_STAINLESS_RUNTIME_VERSION: &str = "v24.3.0";

/// reqwest 顶层错误（如 "error sending request for url …"）会把真正的根因
/// 藏在 source 链里，仅用 `{e}` 打印看不到。这里把整条链拼出来并按类别标注，
/// 便于区分是连接被拒 / DNS / TLS / 超时还是网络不通。
fn describe_send_error(err: &reqwest::Error) -> String {
  let mut parts = vec![err.to_string()];
  let mut src = std::error::Error::source(err);
  while let Some(e) = src {
    parts.push(e.to_string());
    src = std::error::Error::source(e);
  }
  let chain = parts.join(" ← ");

  let kind = if err.is_timeout() {
    "（连接/读取超时）"
  } else if err.is_connect() {
    "（无法建立连接：网络不通、DNS 解析失败或被代理/防火墙拦截）"
  } else {
    ""
  };

  format!("请求失败{kind}：{chain}")
}

/// 按用户配置的代理地址构造 HTTP 客户端：
/// - 留空 → 沿用全局 client（跟随系统/环境变量代理，通常即直连）；
/// - 填了 → 用 `Proxy::all` 让 http/https 请求都经此代理（含对 https 的 CONNECT 隧道）。
///   支持 http / https / socks5，如 `http://localhost:7890`。
fn build_http_client(
  fallback: reqwest::Client,
  proxy_url: &str,
) -> Result<reqwest::Client, String> {
  let proxy_url = proxy_url.trim();
  if proxy_url.is_empty() {
    return Ok(fallback);
  }
  let proxy = reqwest::Proxy::all(proxy_url)
    .map_err(|e| format!("代理地址无效（{proxy_url}）：{e}"))?;
  reqwest::Client::builder()
    .proxy(proxy)
    // 同上：读系统钥匙串根证书，避免 UnknownIssuer。
    .tls_built_in_native_certs(true)
    .build()
    .map_err(|e| format!("构建代理 HTTP 客户端失败：{e}"))
}

/// 把冻屏整图按选区裁剪后存到临时文件，返回文件绝对路径（供 LLM 问答读取）。
#[tauri::command]
pub async fn save_capture_to_temp(
  rect: PixelRect,
  app: AppHandle,
  state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
  let png = {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.clone_frozen_capture()?
  };
  let cropped = ocr::crop_png(&png, rect)?;
  log::info!("[llm] 裁剪截图完成，PNG {} 字节", cropped.len());

  let dir = app
    .path()
    .app_cache_dir()
    .map_err(|e| e.to_string())?
    .join("captures");
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

  let ts = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_millis();
  let path = dir.join(format!("capture-{ts}.png"));
  std::fs::write(&path, &cropped).map_err(|e| e.to_string())?;

  let path_str = path.to_string_lossy().to_string();
  log::info!("[llm] 截图已保存到临时文件：{path_str}");
  // 临时文件随结果窗口存活（支持多轮追问复用同一张图），由窗口 Destroyed 事件删除。
  Ok(path_str)
}

/// 取出某个结果窗口待处理的截图路径。取走即从待处理表移除，故只会被消费一次。
#[tauri::command]
pub fn take_pending_capture(
  window_label: String,
  state: State<'_, Mutex<AppState>>,
) -> Result<Option<String>, String> {
  Ok(
    state
      .lock()
      .map_err(|e| e.to_string())?
      .take_pending_llm_image(&window_label),
  )
}

#[tauri::command]
pub async fn ask_llm_about_image(
  window_label: String,
  image_path: String,
  messages: Vec<ChatTurn>,
  provider: String,
  base_url: String,
  auth_token: String,
  cli_path: String,
  session_dir: String,
  openai_base_url: String,
  openai_api_key: String,
  openai_model: String,
  cloudflare_base_url: String,
  cloudflare_aig_authorization: String,
  cloudflare_aig_byok_alias: String,
  cloudflare_model: String,
  proxy_url: String,
  app: AppHandle,
  http: State<'_, HttpClient>,
  state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
  log::info!(
    "[llm] 收到问答请求，窗口={window_label}，provider={provider}，图片：{image_path}"
  );

  // 把流式请求放进独立的可中止 task：结果窗口关闭时凭 AbortHandle 中止它，
  // task 被丢弃会断开 HTTP 连接 / 丢弃 CLI 子进程（配合 kill_on_drop 杀掉进程），
  // 避免用户关掉窗口后请求仍在后台空跑、白白消耗 token 或 CPU。
  let client = build_http_client(http.client(), &proxy_url)?;
  let task = {
    let app = app.clone();
    let label = window_label.clone();
    let image_path = image_path.clone();
    tokio::spawn(async move {
      let label = label.as_str();
      match provider.as_str() {
        "cli" => {
          stream_llm_cli(
            label,
            &image_path,
            &messages,
            &cli_path,
            &session_dir,
            &app,
          )
          .await
        }
        "openai" => {
          stream_llm_openai_compat(
            label,
            &image_path,
            &messages,
            &openai_base_url,
            &openai_api_key,
            &openai_model,
            &app,
            &client,
          )
          .await
        }
        "cloudflare" => {
          stream_llm_cloudflare(
            label,
            &image_path,
            &messages,
            &cloudflare_base_url,
            &cloudflare_aig_authorization,
            &cloudflare_aig_byok_alias,
            &cloudflare_model,
            &app,
            &client,
          )
          .await
        }
        _ => {
          stream_llm(
            label,
            &image_path,
            &messages,
            &base_url,
            &auth_token,
            &app,
            &client,
          )
          .await
        }
      }
    })
  };

  // 注册中止句柄，供窗口 Destroyed 事件取用。
  if let Ok(mut guard) = state.lock() {
    guard.register_llm_task(window_label.clone(), task.abort_handle());
  }

  let result = match task.await {
    Ok(inner) => inner,
    Err(join_err) if join_err.is_cancelled() => {
      log::info!("[llm] 结果窗口已关闭，问答请求已中止：{window_label}");
      Ok(())
    }
    Err(join_err) => Err(format!("问答任务异常退出：{join_err}")),
  };

  // 注销中止句柄（窗口 Destroyed 事件可能已先一步取走，take 不到也无妨）。
  if let Ok(mut guard) = state.lock() {
    guard.take_llm_task(&window_label);
  }

  match &result {
    Ok(()) => log::info!("[llm] 问答流程结束"),
    Err(err) => {
      log::error!("[llm] 问答失败：{err}");
      let _ =
        app.emit_to(window_label.as_str(), "llm-result:error", err.clone());
    }
  }
  // 不在此处删除截图临时文件：追问会复用同一张图片，文件随结果窗口存活，
  // 由窗口 Destroyed 事件统一清理（见 lib.rs）。
  result
}

/// 通过本地 Claude Code CLI 的 `-p` 参数提问。
/// 输入仅为纯文本：把截图的绝对路径写进 prompt，由 CLI 自行读取图片。
async fn stream_llm_cli(
  label: &str,
  image_path: &str,
  messages: &[ChatTurn],
  cli_path: &str,
  session_dir: &str,
  app: &AppHandle,
) -> Result<(), String> {
  if !std::path::Path::new(image_path).exists() {
    return Err(format!("截图文件不存在：{image_path}"));
  }

  // 解析会话目录：决定 claude -p 子进程的工作目录，进而决定
  // 会话记录落在 ~/.claude/projects/ 下哪个目录。
  // 绝对路径按原样使用；相对名（如 tachibana-capture）放到用户主目录下。
  let session_dir = session_dir.trim();
  let session_dir = if session_dir.is_empty() {
    "tachibana-capture"
  } else {
    session_dir
  };
  let session_path = {
    let p = std::path::Path::new(session_dir);
    if p.is_absolute() {
      p.to_path_buf()
    } else {
      app
        .path()
        .home_dir()
        .map_err(|e| format!("无法定位用户主目录：{e}"))?
        .join(p)
    }
  };
  std::fs::create_dir_all(&session_path)
    .map_err(|e| format!("创建会话目录失败（{}）：{e}", session_path.display()))?;

  // 解析路径字段：允许前置 KEY=VALUE 环境变量，之后是可执行文件及额外参数。
  // 例如：http_proxy=http://localhost:7890 claude
  let mut tokens = cli_path.split_whitespace().peekable();
  let mut envs: Vec<(&str, &str)> = Vec::new();
  while let Some(tok) = tokens.peek() {
    match tok.split_once('=') {
      Some((k, v))
        if !k.is_empty()
          && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') =>
      {
        envs.push((k, v));
        tokens.next();
      }
      _ => break,
    }
  }
  let program = tokens.next().unwrap_or("claude");
  let extra_args: Vec<&str> = tokens.collect();

  // CLI 的 `-p` 只接受单段文本，无法像 HTTP provider 那样传多轮 messages。
  // 单轮：沿用原行为，把预设 prompt 与图片路径拼在一起；
  // 多轮：把历史对话整理成转写，让 CLI 结合上下文与同一张图回答最后的追问。
  let full_prompt = if messages.len() <= 1 {
    let prompt = messages.first().map(|t| t.text.as_str()).unwrap_or("");
    format!(
      "{prompt}\n\n请读取并查看这张本地截图后再回答，图片绝对路径：{image_path}"
    )
  } else {
    let mut transcript = String::from(
      "以下是围绕同一张截图的多轮对话。请先读取并查看这张本地截图，再结合下面的历史对话，回答最后一条用户追问。\n\n",
    );
    for turn in messages {
      let who = if turn.role == "assistant" {
        "助手"
      } else {
        "用户"
      };
      transcript.push_str(&format!("{who}：{}\n\n", turn.text));
    }
    transcript.push_str(&format!("图片绝对路径：{image_path}"));
    transcript
  };

  log::info!(
    "[llm] 启动 Claude Code CLI：{program} {} -p（{} 个环境变量，工作目录 {}）",
    extra_args.join(" "),
    envs.len(),
    session_path.display()
  );
  let mut cmd = tokio::process::Command::new(program);
  // 任务被中止（结果窗口关闭）时，Child 随 future 一起丢弃即杀掉 CLI 子进程。
  cmd.kill_on_drop(true);
  cmd.current_dir(&session_path);
  for (k, v) in &envs {
    cmd.env(k, v);
  }
  // stream-json + --include-partial-messages：让 CLI 按行输出 JSONL，
  // 其中包含逐 token 的 content_block_delta 增量事件，实现真正的流式。
  let mut child = cmd
    .args(&extra_args)
    .arg("-p")
    .arg(&full_prompt)
    .arg("--output-format")
    .arg("stream-json")
    .arg("--verbose")
    .arg("--include-partial-messages")
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| {
      format!("启动 CLI 失败（请检查设置中的可执行文件路径）：{e}")
    })?;

  let stdout = child.stdout.take().ok_or("无法获取 CLI 标准输出")?;
  let mut stderr = child.stderr.take().ok_or("无法获取 CLI 标准错误")?;

  let mut lines = tokio::io::BufReader::new(stdout).lines();
  let mut delta_count = 0usize;
  while let Some(line) = lines
    .next_line()
    .await
    .map_err(|e| format!("读取 CLI 输出失败：{e}"))?
  {
    let line = line.trim();
    if line.is_empty() {
      continue;
    }
    let Ok(json) = serde_json::from_str::<Value>(line) else {
      continue;
    };

    match json.get("type").and_then(|t| t.as_str()) {
      // 逐 token 增量事件（来自 --include-partial-messages）。
      Some("stream_event") => {
        if let Some(text) = json
          .get("event")
          .filter(|e| {
            e.get("type").and_then(|t| t.as_str())
              == Some("content_block_delta")
          })
          .and_then(|e| e.get("delta"))
          .filter(|d| {
            d.get("type").and_then(|t| t.as_str()) == Some("text_delta")
          })
          .and_then(|d| d.get("text"))
          .and_then(|t| t.as_str())
        {
          delta_count += 1;
          let _ = app.emit_to(label, "llm-result:chunk", text);
        }
      }
      // 最终结果：报错时返回错误；若没收到任何增量则用完整文本兜底。
      Some("result") => {
        let is_error =
          json.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
        let result_text =
          json.get("result").and_then(|r| r.as_str()).unwrap_or("");
        if is_error {
          return Err(if result_text.is_empty() {
            "CLI 返回错误".to_string()
          } else {
            result_text.to_string()
          });
        }
        if delta_count == 0 && !result_text.is_empty() {
          let _ = app.emit_to(label, "llm-result:chunk", result_text);
        }
      }
      _ => {}
    }
  }

  let status = child
    .wait()
    .await
    .map_err(|e| format!("等待 CLI 退出失败：{e}"))?;
  if !status.success() {
    let mut err_text = String::new();
    let _ = stderr.read_to_string(&mut err_text).await;
    return Err(format!(
      "CLI 退出码 {:?}：{}",
      status.code(),
      err_text.trim()
    ));
  }

  log::info!("[llm] CLI 流程结束，共 {delta_count} 段增量输出");
  let _ = app.emit_to(label, "llm-result:done", ());
  Ok(())
}

async fn stream_llm(
  label: &str,
  image_path: &str,
  messages: &[ChatTurn],
  base_url: &str,
  auth_token: &str,
  app: &AppHandle,
  client: &reqwest::Client,
) -> Result<(), String> {
  if auth_token.is_empty() {
    return Err("未配置 Auth Token，请在设置中填写".to_string());
  }
  if base_url.is_empty() {
    return Err("未配置 Base URL，请在设置中填写".to_string());
  }

  let image_bytes =
    std::fs::read(image_path).map_err(|e| format!("读取截图失败：{e}"))?;
  let image_b64 = STANDARD.encode(&image_bytes);
  log::info!(
    "[llm] 读取图片 {} 字节，base64 编码完成（{} 轮对话）",
    image_bytes.len(),
    messages.len()
  );

  let body = json!({
    "model": LLM_MODEL,
    "max_tokens": 2048,
    "stream": true,
    "messages": build_anthropic_messages(messages, &image_b64)
  });

  let endpoint = format!("{}/v1/messages", base_url.trim_end_matches('/'));
  // CC 每次请求都会带一个新的 session id，这里同样每请求生成一次。
  let session_id = uuid::Uuid::new_v4().to_string();
  log::info!("[llm] 请求 {endpoint}，模型 {LLM_MODEL}");
  let mut resp = client
    .post(endpoint)
    .header("accept", "application/json")
    .header("authorization", format!("Bearer {auth_token}"))
    .header("content-type", "application/json")
    .header("user-agent", CC_USER_AGENT)
    .header("x-app", "cli")
    .header("anthropic-version", "2023-06-01")
    .header("anthropic-beta", CC_ANTHROPIC_BETA)
    .header("anthropic-dangerous-direct-browser-access", "true")
    .header("x-claude-code-session-id", &session_id)
    .header("x-stainless-arch", "arm64")
    .header("x-stainless-lang", "js")
    .header("x-stainless-os", "MacOS")
    .header("x-stainless-package-version", CC_STAINLESS_PACKAGE_VERSION)
    .header("x-stainless-retry-count", "0")
    .header("x-stainless-runtime", "node")
    .header("x-stainless-runtime-version", CC_STAINLESS_RUNTIME_VERSION)
    .header("x-stainless-timeout", "600")
    .json(&body)
    .send()
    .await
    .map_err(|e| describe_send_error(&e))?;

  let status = resp.status();
  log::info!("[llm] 网关响应状态 {status}");
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("API 返回错误 {status}：{text}"));
  }

  log::info!("[llm] 开始接收流式响应");
  let mut buffer = String::new();
  let mut chunk_count = 0usize;
  while let Some(chunk) =
    resp.chunk().await.map_err(|e| format!("流读取失败：{e}"))?
  {
    buffer.push_str(&String::from_utf8_lossy(&chunk));

    while let Some(idx) = buffer.find("\n\n") {
      let event_block: String = buffer.drain(..idx + 2).collect();
      chunk_count += handle_sse_block(&event_block, label, app);
    }
  }

  log::info!("[llm] 流式响应结束，共 {chunk_count} 个文本增量");
  Ok(())
}

/// OpenAI 兼容 `/v1/chat/completions` 流式调用。
/// 适用于 OpenAI 官方、阿里 DashScope `/compatible-mode/v1`、Azure OpenAI、
/// OpenRouter、SiliconFlow、智谱 GLM-4V、Moonshot 等任何 OpenAI 兼容 vision 端点。
async fn stream_llm_openai_compat(
  label: &str,
  image_path: &str,
  messages: &[ChatTurn],
  base_url: &str,
  api_key: &str,
  model: &str,
  app: &AppHandle,
  client: &reqwest::Client,
) -> Result<(), String> {
  if api_key.is_empty() {
    return Err("未配置 API Key，请在设置中填写".to_string());
  }
  if base_url.is_empty() {
    return Err("未配置 Base URL，请在设置中填写".to_string());
  }
  if model.is_empty() {
    return Err("未配置模型名，请在设置中填写".to_string());
  }

  let image_bytes =
    std::fs::read(image_path).map_err(|e| format!("读取截图失败：{e}"))?;
  let image_b64 = STANDARD.encode(&image_bytes);
  log::info!(
    "[llm] OpenAI 读取图片 {} 字节，base64 编码完成（{} 轮对话）",
    image_bytes.len(),
    messages.len()
  );

  let data_url = format!("data:image/png;base64,{image_b64}");
  let body = json!({
    "model": model,
    "stream": true,
    "messages": build_openai_messages(messages, &data_url)
  });

  // 兼容用户在 base URL 里带或不带 /v1 后缀。
  let trimmed = base_url.trim_end_matches('/');
  let endpoint = if trimmed.ends_with("/v1") {
    format!("{trimmed}/chat/completions")
  } else {
    format!("{trimmed}/v1/chat/completions")
  };
  log::info!("[llm] 请求 OpenAI {endpoint}，模型 {model}");
  let mut resp = client
    .post(endpoint)
    .header("accept", "text/event-stream")
    .header("authorization", format!("Bearer {api_key}"))
    .header("content-type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| describe_send_error(&e))?;

  let status = resp.status();
  log::info!("[llm] OpenAI 响应状态 {status}");
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("API 返回错误 {status}：{text}"));
  }

  log::info!("[llm] 开始接收 OpenAI 流式响应");
  let mut buffer = String::new();
  let mut chunk_count = 0usize;
  while let Some(chunk) =
    resp.chunk().await.map_err(|e| format!("流读取失败：{e}"))?
  {
    buffer.push_str(&String::from_utf8_lossy(&chunk));

    while let Some(idx) = buffer.find("\n\n") {
      let event_block: String = buffer.drain(..idx + 2).collect();
      chunk_count += handle_openai_sse_block(&event_block, label, app);
    }
  }

  log::info!("[llm] OpenAI 流式响应结束，共 {chunk_count} 个文本增量");
  let _ = app.emit_to(label, "llm-result:done", ());
  Ok(())
}

/// Cloudflare AI Gateway 的 BYOK + OpenAI 兼容端点。
/// URL 形如 `https://gateway.ai.cloudflare.com/v1/{account}/{gateway}`，
/// 最终请求路径 `{base}/compat/chat/completions`，模型字段为
/// `provider/model-name`（如 `anthropic/claude-3-5-sonnet-20241022`）。
/// 鉴权走 `cf-aig-authorization`，下游 provider 的 API key 由
/// `cf-aig-byok-alias` 指定的别名在网关侧注入。
async fn stream_llm_cloudflare(
  label: &str,
  image_path: &str,
  messages: &[ChatTurn],
  base_url: &str,
  aig_auth: &str,
  byok_alias: &str,
  model: &str,
  app: &AppHandle,
  client: &reqwest::Client,
) -> Result<(), String> {
  if base_url.is_empty() {
    return Err("未配置 Cloudflare Base URL，请在设置中填写".to_string());
  }
  if aig_auth.is_empty() {
    return Err("未配置 cf-aig-authorization，请在设置中填写".to_string());
  }
  if byok_alias.is_empty() {
    return Err("未配置 cf-aig-byok-alias，请在设置中填写".to_string());
  }
  if model.is_empty() {
    return Err("未配置模型，请在设置中填写".to_string());
  }

  let image_bytes =
    std::fs::read(image_path).map_err(|e| format!("读取截图失败：{e}"))?;
  let image_b64 = STANDARD.encode(&image_bytes);
  log::info!(
    "[llm] Cloudflare 读取图片 {} 字节，base64 编码完成（{} 轮对话）",
    image_bytes.len(),
    messages.len()
  );

  let data_url = format!("data:image/png;base64,{image_b64}");
  let body = json!({
    "model": model,
    "stream": true,
    "messages": build_openai_messages(messages, &data_url)
  });

  let endpoint = format!(
    "{}/compat/chat/completions",
    base_url.trim_end_matches('/')
  );
  log::info!("[llm] 请求 Cloudflare {endpoint}，模型 {model}");

  let aig_auth_header = if aig_auth.starts_with("Bearer ") {
    aig_auth.to_string()
  } else {
    format!("Bearer {aig_auth}")
  };

  let mut resp = client
    .post(endpoint)
    .header("accept", "text/event-stream")
    .header("content-type", "application/json")
    .header("cf-aig-authorization", aig_auth_header)
    .header("cf-aig-byok-alias", byok_alias)
    .json(&body)
    .send()
    .await
    .map_err(|e| describe_send_error(&e))?;

  let status = resp.status();
  log::info!("[llm] Cloudflare 响应状态 {status}");
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("API 返回错误 {status}：{text}"));
  }

  log::info!("[llm] 开始接收 Cloudflare 流式响应");
  let mut buffer = String::new();
  let mut chunk_count = 0usize;
  while let Some(chunk) =
    resp.chunk().await.map_err(|e| format!("流读取失败：{e}"))?
  {
    buffer.push_str(&String::from_utf8_lossy(&chunk));

    while let Some(idx) = buffer.find("\n\n") {
      let event_block: String = buffer.drain(..idx + 2).collect();
      chunk_count += handle_openai_sse_block(&event_block, label, app);
    }
  }

  log::info!("[llm] Cloudflare 流式响应结束，共 {chunk_count} 个文本增量");
  let _ = app.emit_to(label, "llm-result:done", ());
  Ok(())
}

/// 解析 OpenAI 兼容 SSE 块：每行 `data: {...}`，结束标记 `data: [DONE]`，
/// 文本增量在 `choices[0].delta.content`。
fn handle_openai_sse_block(
  block: &str,
  label: &str,
  app: &AppHandle,
) -> usize {
  let mut delta_count = 0usize;
  for line in block.lines() {
    let Some(data) = line.trim().strip_prefix("data:") else {
      continue;
    };
    let data = data.trim();
    if data.is_empty() {
      continue;
    }
    if data == "[DONE]" {
      continue;
    }

    let Ok(json) = serde_json::from_str::<Value>(data) else {
      continue;
    };

    if let Some(err) = json.get("error") {
      let msg = err
        .get("message")
        .and_then(|m| m.as_str())
        .unwrap_or("未知错误");
      log::error!("[llm] OpenAI 流内错误：{msg}");
      let _ = app.emit_to(label, "llm-result:error", msg);
      continue;
    }

    if let Some(text) = json
      .get("choices")
      .and_then(|c| c.get(0))
      .and_then(|c| c.get("delta"))
      .and_then(|d| d.get("content"))
      .and_then(|t| t.as_str())
    {
      if !text.is_empty() {
        delta_count += 1;
        let _ = app.emit_to(label, "llm-result:chunk", text);
      }
    }
  }
  delta_count
}

/// 解析一个 SSE 事件块，返回其中产生的文本增量数量。
fn handle_sse_block(block: &str, label: &str, app: &AppHandle) -> usize {
  let mut delta_count = 0usize;
  for line in block.lines() {
    let Some(data) = line.trim().strip_prefix("data:") else {
      continue;
    };
    let data = data.trim();
    if data.is_empty() {
      continue;
    }

    let Ok(json) = serde_json::from_str::<Value>(data) else {
      continue;
    };

    match json.get("type").and_then(|t| t.as_str()) {
      Some("content_block_delta") => {
        if let Some(text) = json
          .get("delta")
          .filter(|d| {
            d.get("type").and_then(|t| t.as_str()) == Some("text_delta")
          })
          .and_then(|d| d.get("text"))
          .and_then(|t| t.as_str())
        {
          delta_count += 1;
          let _ = app.emit_to(label, "llm-result:chunk", text);
        }
      }
      Some("message_stop") => {
        log::info!("[llm] 收到 message_stop");
        let _ = app.emit_to(label, "llm-result:done", ());
      }
      Some("error") => {
        let msg = json
          .get("error")
          .and_then(|e| e.get("message"))
          .and_then(|m| m.as_str())
          .unwrap_or("未知错误");
        log::error!("[llm] 流内错误：{msg}");
        let _ = app.emit_to(label, "llm-result:error", msg);
      }
      _ => {}
    }
  }
  delta_count
}
