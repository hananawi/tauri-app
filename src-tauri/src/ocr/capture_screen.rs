use tauri::{LogicalPosition, LogicalSize, Manager};

use crate::ocr::Ocr;

pub async fn setup_mask(app: tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("mask").unwrap();
    let monitor = window.current_monitor().unwrap().unwrap();
    let size = monitor.size();

    window
        .set_size(LogicalSize::new(size.width, size.height))
        .unwrap();
    window.set_position(LogicalPosition::new(0, 0)).unwrap();
    window.set_always_on_top(true).unwrap();

    Ok(())
}

impl Ocr {
    pub fn capture_screen() {}
}
