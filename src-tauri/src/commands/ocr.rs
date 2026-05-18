use crate::ocr::{self, DetectionResultItem, Rect};

#[tauri::command]
pub async fn detect_text(
  rect: Option<Rect>,
) -> Result<Vec<DetectionResultItem>, String> {
  let rect = rect.ok_or("缺少识别区域")?;
  let options = ocr::default_options();
  let items = ocr::detect_text(rect, &options);
  Ok(items)
}

#[tauri::command]
pub async fn capture_screen(rect: Option<Rect>) -> Result<(), String> {
  let rect = rect.ok_or("缺少截图区域")?;
  ocr::capture_screen_to_clipboard(rect)
}
