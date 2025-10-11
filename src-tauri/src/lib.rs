mod ocr;

mod splashscreen;

use std::sync::Mutex;

use tauri::async_runtime::spawn;

use crate::ocr::*;
use crate::splashscreen::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
        }))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            set_complete,
            detect_text,
            capture_screen
        ])
        .setup(|app| {
            // spawn(setup(app.handle().clone()));
            spawn(setup_mask(app.handle().clone()));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
