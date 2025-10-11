use objc2::rc::Retained;
use objc2_foundation::{NSArray, NSString};
use tauri::{LogicalPosition, LogicalSize, Manager};

use crate::ocr::OcrOptions;

pub struct Objc2Options {
    pub target_languages: Retained<NSArray<NSString>>,
}

pub fn convert_options(options: OcrOptions) -> Objc2Options {
    let target_languages: Retained<NSArray<NSString>> = options
        .target_languages
        .into_iter()
        .map(|s| NSString::from_str(&s))
        .collect();

    Objc2Options { target_languages }
}

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
