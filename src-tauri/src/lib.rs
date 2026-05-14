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
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_store::Builder::new().build())
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
      detect_text,
      capture_screen,
      gen_audio_from_text,
      copy_text,
      stop_clipping,
      capture_to_temp,
      take_pending_capture,
      ask_llm_about_image,
      open_llm_result_window,
      open_settings_window
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
