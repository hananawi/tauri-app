use objc2_core_foundation::{CGPoint, CGRect, CGSize};

use crate::ocr::{get_ocr_singleton, DetectionResultItem, Rect};

#[tauri::command]
pub async fn detect_text(
  rect: Option<Rect>,
) -> Result<Vec<DetectionResultItem>, String> {
  println!("ocr start");

  let ocr = get_ocr_singleton();
  let rect = rect.unwrap();

  let detect_result_vec = ocr.detect_text(rect);

  println!("ocr end {detect_result_vec:#?}");
  Ok(detect_result_vec)
}

#[tauri::command]
pub async fn capture_screen(rect: Option<Rect>) -> Result<(), String> {
  let ocr = get_ocr_singleton();

  let rect = rect.unwrap();
  let Rect {
    x,
    y,
    width,
    height,
  } = rect;
  let rect: CGRect = CGRect::new(CGPoint { x, y }, CGSize { width, height });

  ocr.capture_screen(rect);

  Ok(())
}
