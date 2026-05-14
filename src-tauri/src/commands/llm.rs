use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::log;
use tokio::io::AsyncReadExt;

use crate::http_client::HttpClient;
use crate::ocr::{get_ocr_singleton, Rect};
use crate::state::AppState;

// base_url / auth_token 由前端从设置中读取并传入。
// idealab 网关仅支持 claude-opus-4-6 / claude-opus-4-7。
const LLM_MODEL: &str = "claude-opus-4-7";

#[tauri::command]
pub async fn capture_to_temp(
  rect: Option<Rect>,
  app: AppHandle,
  state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
  let rect = rect.ok_or("缺少截图区域")?;
  log::info!("[llm] 开始截图，区域 {rect:?}");
  let png = get_ocr_singleton().capture_screen_png(rect.to_cg_rect())?;
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
  app: AppHandle,
  http: State<'_, HttpClient>,
) -> Result<(), String> {
  log::info!(
    "[llm] 收到问答请求，provider={provider}，图片：{image_path}"
  );
  let result = if provider == "cli" {
    stream_llm_cli(&image_path, &prompt, &cli_path, &app).await
  } else {
    stream_llm(&image_path, &prompt, &base_url, &auth_token, &app, &http)
      .await
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
  app: &AppHandle,
) -> Result<(), String> {
  if !std::path::Path::new(image_path).exists() {
    return Err(format!("截图文件不存在：{image_path}"));
  }

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
    "[llm] 启动 Claude Code CLI：{program} {} -p（{} 个环境变量）",
    extra_args.join(" "),
    envs.len()
  );
  let mut cmd = tokio::process::Command::new(program);
  for (k, v) in &envs {
    cmd.env(k, v);
  }
  let mut child = cmd
    .args(&extra_args)
    .arg("-p")
    .arg(&full_prompt)
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| {
      format!("启动 CLI 失败（请检查设置中的可执行文件路径）：{e}")
    })?;

  let stdout = child.stdout.take().ok_or("无法获取 CLI 标准输出")?;
  let mut stderr = child.stderr.take().ok_or("无法获取 CLI 标准错误")?;

  let mut reader = tokio::io::BufReader::new(stdout);
  let mut buf = [0u8; 4096];
  let mut chunk_count = 0usize;
  loop {
    let n = reader
      .read(&mut buf)
      .await
      .map_err(|e| format!("读取 CLI 输出失败：{e}"))?;
    if n == 0 {
      break;
    }
    chunk_count += 1;
    let text = String::from_utf8_lossy(&buf[..n]).to_string();
    let _ = app.emit("llm-result:chunk", text);
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

  log::info!("[llm] CLI 流程结束，共 {chunk_count} 段输出");
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
  log::info!("[llm] 请求 {endpoint}，模型 {LLM_MODEL}");
  let client = http.client();
  let mut resp = client
    .post(endpoint)
    .header("authorization", format!("Bearer {auth_token}"))
    .header("anthropic-version", "2023-06-01")
    .header("content-type", "application/json")
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

/// 解析一个 SSE 事件块，返回其中产生的文本增量数量。
fn handle_sse_block(block: &str, app: &AppHandle) -> usize {
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
          let _ = app.emit("llm-result:chunk", text);
        }
      }
      Some("message_stop") => {
        log::info!("[llm] 收到 message_stop");
        let _ = app.emit("llm-result:done", ());
      }
      Some("error") => {
        let msg = json
          .get("error")
          .and_then(|e| e.get("message"))
          .and_then(|m| m.as_str())
          .unwrap_or("未知错误");
        log::error!("[llm] 流内错误：{msg}");
        let _ = app.emit("llm-result:error", msg);
      }
      _ => {}
    }
  }
  delta_count
}
