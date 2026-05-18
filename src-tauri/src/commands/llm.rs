use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::log;
use tokio::io::{AsyncBufReadExt, AsyncReadExt};

use crate::http_client::HttpClient;
use crate::ocr::{self, Rect};
use crate::state::AppState;

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

#[tauri::command]
pub async fn capture_to_temp(
  rect: Option<Rect>,
  app: AppHandle,
  state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
  let rect = rect.ok_or("缺少截图区域")?;
  log::info!("[llm] 开始截图，区域 {rect:?}");
  let png = ocr::capture_screen_png(rect)?;
  log::info!("[llm] 截图完成，PNG {} 字节", png.len());

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
  std::fs::write(&path, &png).map_err(|e| e.to_string())?;

  let path_str = path.to_string_lossy().to_string();
  log::info!("[llm] 截图已保存到临时文件：{path_str}");

  // 记录本次截图为待处理图片，并取出上一次的截图路径准备删除。
  let old_image = {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    guard.set_pending_llm_image(path_str.clone());
    guard.replace_last_llm_image(path_str.clone())
  };
  if let Some(old) = old_image {
    if old != path_str {
      match std::fs::remove_file(&old) {
        Ok(()) => log::info!("[llm] 已删除上一次截图：{old}"),
        Err(e) => log::warn!("[llm] 删除上一次截图失败：{old}（{e}）"),
      }
    }
  }

  Ok(path_str)
}

#[tauri::command]
pub fn take_pending_capture(
  state: State<'_, Mutex<AppState>>,
) -> Result<Option<String>, String> {
  Ok(
    state
      .lock()
      .map_err(|e| e.to_string())?
      .take_pending_llm_image(),
  )
}

#[tauri::command]
pub async fn ask_llm_about_image(
  image_path: String,
  prompt: String,
  provider: String,
  base_url: String,
  auth_token: String,
  cli_path: String,
  session_dir: String,
  dashscope_base_url: String,
  dashscope_api_key: String,
  dashscope_model: String,
  app: AppHandle,
  http: State<'_, HttpClient>,
) -> Result<(), String> {
  log::info!(
    "[llm] 收到问答请求，provider={provider}，图片：{image_path}"
  );
  let result = match provider.as_str() {
    "cli" => {
      stream_llm_cli(&image_path, &prompt, &cli_path, &session_dir, &app).await
    }
    "dashscope" => {
      stream_llm_dashscope(
        &image_path,
        &prompt,
        &dashscope_base_url,
        &dashscope_api_key,
        &dashscope_model,
        &app,
        &http,
      )
      .await
    }
    _ => {
      stream_llm(&image_path, &prompt, &base_url, &auth_token, &app, &http)
        .await
    }
  };
  match &result {
    Ok(()) => log::info!("[llm] 问答流程结束"),
    Err(err) => {
      log::error!("[llm] 问答失败：{err}");
      let _ = app.emit("llm-result:error", err.clone());
    }
  }
  result
}

/// 通过本地 Claude Code CLI 的 `-p` 参数提问。
/// 输入仅为纯文本：把截图的绝对路径写进 prompt，由 CLI 自行读取图片。
async fn stream_llm_cli(
  image_path: &str,
  prompt: &str,
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

  let full_prompt = format!(
    "{prompt}\n\n请读取并查看这张本地截图后再回答，图片绝对路径：{image_path}"
  );

  log::info!(
    "[llm] 启动 Claude Code CLI：{program} {} -p（{} 个环境变量，工作目录 {}）",
    extra_args.join(" "),
    envs.len(),
    session_path.display()
  );
  let mut cmd = tokio::process::Command::new(program);
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
          let _ = app.emit("llm-result:chunk", text);
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
          let _ = app.emit("llm-result:chunk", result_text);
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
  let _ = app.emit("llm-result:done", ());
  Ok(())
}

async fn stream_llm(
  image_path: &str,
  prompt: &str,
  base_url: &str,
  auth_token: &str,
  app: &AppHandle,
  http: &HttpClient,
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
    "[llm] 读取图片 {} 字节，base64 编码完成",
    image_bytes.len()
  );

  let body = json!({
    "model": LLM_MODEL,
    "max_tokens": 2048,
    "stream": true,
    "messages": [{
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": image_b64
          }
        },
        { "type": "text", "text": prompt }
      ]
    }]
  });

  let endpoint = format!("{}/v1/messages", base_url.trim_end_matches('/'));
  // CC 每次请求都会带一个新的 session id，这里同样每请求生成一次。
  let session_id = uuid::Uuid::new_v4().to_string();
  log::info!("[llm] 请求 {endpoint}，模型 {LLM_MODEL}");
  let client = http.client();
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
    .map_err(|e| format!("请求失败：{e}"))?;

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
      chunk_count += handle_sse_block(&event_block, app);
    }
  }

  log::info!("[llm] 流式响应结束，共 {chunk_count} 个文本增量");
  Ok(())
}

/// 阿里 DashScope OpenAI 兼容模式 (`/compatible-mode/v1`) 的流式调用。
/// 同样可承载任何其他 OpenAI 兼容的 vision 端点（智谱 GLM-4V、Moonshot、SiliconFlow 等），
/// 只需把 base_url / model 改成对应值。
async fn stream_llm_dashscope(
  image_path: &str,
  prompt: &str,
  base_url: &str,
  api_key: &str,
  model: &str,
  app: &AppHandle,
  http: &HttpClient,
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
    "[llm] DashScope 读取图片 {} 字节，base64 编码完成",
    image_bytes.len()
  );

  let data_url = format!("data:image/png;base64,{image_b64}");
  let body = json!({
    "model": model,
    "stream": true,
    "messages": [{
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": data_url } },
        { "type": "text", "text": prompt }
      ]
    }]
  });

  let endpoint = dashscope_endpoint(base_url);
  log::info!("[llm] 请求 DashScope {endpoint}，模型 {model}");
  let client = http.client();
  let mut resp = client
    .post(endpoint)
    .header("accept", "text/event-stream")
    .header("authorization", format!("Bearer {api_key}"))
    .header("content-type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("请求失败：{e}"))?;

  let status = resp.status();
  log::info!("[llm] DashScope 响应状态 {status}");
  if !status.is_success() {
    let text = resp.text().await.unwrap_or_default();
    return Err(format!("API 返回错误 {status}：{text}"));
  }

  log::info!("[llm] 开始接收 DashScope 流式响应");
  let mut buffer = String::new();
  let mut chunk_count = 0usize;
  while let Some(chunk) =
    resp.chunk().await.map_err(|e| format!("流读取失败：{e}"))?
  {
    buffer.push_str(&String::from_utf8_lossy(&chunk));

    while let Some(idx) = buffer.find("\n\n") {
      let event_block: String = buffer.drain(..idx + 2).collect();
      chunk_count += handle_openai_sse_block(&event_block, app);
    }
  }

  log::info!("[llm] DashScope 流式响应结束，共 {chunk_count} 个文本增量");
  let _ = app.emit("llm-result:done", ());
  Ok(())
}

/// SSE 块解析结果。把"提取信号"和"emit 事件"解耦，便于纯函数单测。
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct SseParse {
  pub deltas: Vec<String>,
  pub done: bool,
  pub error: Option<String>,
}

impl SseParse {
  pub fn delta_count(&self) -> usize {
    self.deltas.len()
  }
}

/// 解析 Anthropic 流式 SSE 块：
/// - `content_block_delta` + `text_delta`：文本增量
/// - `message_stop`：流结束
/// - `error`：流内错误
pub(crate) fn parse_anthropic_sse_block(block: &str) -> SseParse {
  let mut out = SseParse::default();
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
          out.deltas.push(text.to_string());
        }
      }
      Some("message_stop") => {
        out.done = true;
      }
      Some("error") => {
        out.error = Some(
          json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误")
            .to_string(),
        );
      }
      _ => {}
    }
  }
  out
}

/// 解析 OpenAI 兼容 SSE 块：每行 `data: {...}`，结束标记 `data: [DONE]`，
/// 文本增量在 `choices[0].delta.content`。
pub(crate) fn parse_openai_sse_block(block: &str) -> SseParse {
  let mut out = SseParse::default();
  for line in block.lines() {
    let Some(data) = line.trim().strip_prefix("data:") else {
      continue;
    };
    let data = data.trim();
    if data.is_empty() {
      continue;
    }
    if data == "[DONE]" {
      out.done = true;
      continue;
    }

    let Ok(json) = serde_json::from_str::<Value>(data) else {
      continue;
    };

    if let Some(err) = json.get("error") {
      out.error = Some(
        err
          .get("message")
          .and_then(|m| m.as_str())
          .unwrap_or("未知错误")
          .to_string(),
      );
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
        out.deltas.push(text.to_string());
      }
    }
  }
  out
}

/// 兼容用户在 base URL 里带或不带 `/v1` 后缀，拼出 OpenAI 兼容 chat 端点。
pub(crate) fn dashscope_endpoint(base_url: &str) -> String {
  let trimmed = base_url.trim_end_matches('/');
  if trimmed.ends_with("/v1") {
    format!("{trimmed}/chat/completions")
  } else {
    format!("{trimmed}/v1/chat/completions")
  }
}

fn handle_openai_sse_block(block: &str, app: &AppHandle) -> usize {
  let parsed = parse_openai_sse_block(block);
  for text in &parsed.deltas {
    let _ = app.emit("llm-result:chunk", text.clone());
  }
  if let Some(err) = &parsed.error {
    log::error!("[llm] DashScope 流内错误：{err}");
    let _ = app.emit("llm-result:error", err.clone());
  }
  parsed.delta_count()
}

fn handle_sse_block(block: &str, app: &AppHandle) -> usize {
  let parsed = parse_anthropic_sse_block(block);
  for text in &parsed.deltas {
    let _ = app.emit("llm-result:chunk", text.clone());
  }
  if parsed.done {
    log::info!("[llm] 收到 message_stop");
    let _ = app.emit("llm-result:done", ());
  }
  if let Some(err) = &parsed.error {
    log::error!("[llm] 流内错误：{err}");
    let _ = app.emit("llm-result:error", err.clone());
  }
  parsed.delta_count()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn anthropic_parses_text_delta() {
    let block = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hello\"}}\n\n";
    let parsed = parse_anthropic_sse_block(block);
    assert_eq!(parsed.deltas, vec!["hello".to_string()]);
    assert!(!parsed.done);
    assert!(parsed.error.is_none());
  }

  #[test]
  fn anthropic_aggregates_multiple_deltas_in_block() {
    let block = concat!(
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"foo\"}}\n",
      "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"bar\"}}\n\n",
    );
    let parsed = parse_anthropic_sse_block(block);
    assert_eq!(parsed.deltas, vec!["foo".to_string(), "bar".to_string()]);
  }

  #[test]
  fn anthropic_message_stop_sets_done() {
    let parsed = parse_anthropic_sse_block("data: {\"type\":\"message_stop\"}\n\n");
    assert!(parsed.done);
    assert!(parsed.deltas.is_empty());
  }

  #[test]
  fn anthropic_error_event_captured() {
    let block = "data: {\"type\":\"error\",\"error\":{\"message\":\"overloaded\"}}\n\n";
    let parsed = parse_anthropic_sse_block(block);
    assert_eq!(parsed.error.as_deref(), Some("overloaded"));
  }

  #[test]
  fn anthropic_ignores_unknown_or_malformed_lines() {
    // 非 data: 前缀 / 非 JSON / 未知事件类型，都不应产生增量。
    let block = "event: ping\ndata: not-json\ndata: {\"type\":\"ping\"}\n\n";
    let parsed = parse_anthropic_sse_block(block);
    assert!(parsed.deltas.is_empty());
    assert!(!parsed.done);
    assert!(parsed.error.is_none());
  }

  #[test]
  fn anthropic_ignores_non_text_delta_subtypes() {
    // input_json_delta 等非文本增量不应被当成 chunk 输出。
    let block = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}\n\n";
    let parsed = parse_anthropic_sse_block(block);
    assert!(parsed.deltas.is_empty());
  }

  #[test]
  fn openai_parses_delta() {
    let block = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n";
    let parsed = parse_openai_sse_block(block);
    assert_eq!(parsed.deltas, vec!["hi".to_string()]);
  }

  #[test]
  fn openai_done_sentinel_sets_done_without_delta() {
    let parsed = parse_openai_sse_block("data: [DONE]\n\n");
    assert!(parsed.done);
    assert!(parsed.deltas.is_empty());
  }

  #[test]
  fn openai_error_in_stream_captured() {
    let block = "data: {\"error\":{\"message\":\"rate limit\"}}\n\n";
    let parsed = parse_openai_sse_block(block);
    assert_eq!(parsed.error.as_deref(), Some("rate limit"));
    assert!(parsed.deltas.is_empty());
  }

  #[test]
  fn openai_skips_empty_content() {
    // 模型 keepalive 时常发空 content，不应叠加到输出。
    let block = "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n";
    let parsed = parse_openai_sse_block(block);
    assert!(parsed.deltas.is_empty());
  }

  #[test]
  fn dashscope_endpoint_normalizes_v1_suffix() {
    assert_eq!(
      dashscope_endpoint("https://x.com"),
      "https://x.com/v1/chat/completions"
    );
    assert_eq!(
      dashscope_endpoint("https://x.com/"),
      "https://x.com/v1/chat/completions"
    );
    assert_eq!(
      dashscope_endpoint("https://x.com/v1"),
      "https://x.com/v1/chat/completions"
    );
    assert_eq!(
      dashscope_endpoint("https://x.com/v1/"),
      "https://x.com/v1/chat/completions"
    );
  }
}
