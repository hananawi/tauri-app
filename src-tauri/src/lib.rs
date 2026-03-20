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
      copy_text
    ])
    .setup(|app| {
      init_app::init_app(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
