mod commands;
mod http_client;
mod init_app;
mod ocr;
mod state;

use std::sync::Mutex;

use tauri_plugin_log::{
  log::LevelFilter, Builder as LogBuilder, Target as LogTarget,
  TargetKind as LogTargetKind,
};

use crate::{commands::*, http_client::*, state::*};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(Mutex::new(AppState::new()))
    .manage(HttpClient::new())
    // clipimg:// 自定义协议：把内存里的冻屏整图直接喂给截图蒙层当底图，
    // 不落盘、不走 base64，浏览器原生流式加载。
    .register_uri_scheme_protocol("clipimg", |ctx, _request| {
      use tauri::http::Response;
      use tauri::Manager;
      let png = ctx.app_handle().try_state::<Mutex<AppState>>().and_then(
        |state| state.lock().ok().and_then(|g| g.frozen_capture.clone()),
      );
      match png {
        Some(bytes) => Response::builder()
          .header("Content-Type", "image/png")
          .header("Cache-Control", "no-store")
          .body(bytes)
          .unwrap(),
        None => Response::builder().status(404).body(Vec::new()).unwrap(),
      }
    })
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(
      LogBuilder::default()
        .targets([
          LogTarget::new(LogTargetKind::Stdout),
          LogTarget::new(LogTargetKind::Webview),
        ])
        .level(LevelFilter::Info)
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      recognize_capture,
      gen_audio_from_text,
      copy_text,
      stop_clipping,
      save_capture_to_temp,
      take_pending_capture,
      ask_llm_about_image,
      open_llm_result_window,
      open_settings_window,
      update_clip_shortcut,
      write_text_file
    ])
    .on_window_event(|window, event| {
      // settings / llm-result 窗口点红叉时隐藏而非销毁，
      // 否则下次再 get_webview_window 会找不到。
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let label = window.label();
        if label == "settings" || label == "llm-result" {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .setup(|app| {
      init_app::init_app(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
