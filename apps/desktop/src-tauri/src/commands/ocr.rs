use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::ocr::{self, DetectionResultItem, PixelRect};
use crate::state::AppState;

/// 识别选区：从冻屏整图裁出选区 → 写入剪贴板 → 跑 OCR 返回文字。
/// `display_*` 为选区在屏幕上的逻辑尺寸，用于换算 OCR 文字浮层坐标。
#[tauri::command]
pub async fn recognize_capture(
  rect: PixelRect,
  display_width: f64,
  display_height: f64,
  app: AppHandle,
) -> Result<Vec<DetectionResultItem>, String> {
  let png = {
    let state = app.state::<Mutex<AppState>>();
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.clone_frozen_capture()?
  };
  let cropped = ocr::crop_png(&png, rect)?;
  ocr::png_to_clipboard(&cropped)?;

  let options = ocr::default_options();
  Ok(ocr::detect_text(
    &cropped,
    display_width,
    display_height,
    &options,
  ))
}
