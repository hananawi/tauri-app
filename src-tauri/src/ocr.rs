use std::sync::OnceLock;

use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use serde::{Deserialize, Serialize};

mod capture_screen;
mod detect_text;
mod utils;

static OCR_INSTANCE: OnceLock<Ocr> = OnceLock::new();

pub struct Ocr {
  options: OcrOptions,
}

#[derive(Clone)]
pub struct OcrOptions {
  target_languages: Vec<&'static str>,
}

impl Ocr {
  pub fn new(options: OcrOptions) -> Self {
    Self { options }
  }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

impl Rect {
  pub fn from_cg_rect(cg_rect: CGRect, parent_px_rect: &Rect) -> Self {
    let x_px = cg_rect.origin.x * parent_px_rect.width;
    let y_px =
      (1.0 - (cg_rect.origin.y + cg_rect.size.height)) * parent_px_rect.height;
    let width_px = cg_rect.size.width * parent_px_rect.width;
    let height_px = cg_rect.size.height * parent_px_rect.height;

    Rect {
      x: x_px,
      y: y_px,
      width: width_px,
      height: height_px,
    }
  }

  pub fn to_cg_rect(&self) -> CGRect {
    let Rect {
      x,
      y,
      width,
      height,
    } = *self;

    CGRect::new(CGPoint { x, y }, CGSize { width, height })
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DetectionResultItem {
  text: String,
  rect: Rect,
}

fn get_ocr_singleton() -> &'static Ocr {
  OCR_INSTANCE.get_or_init(|| {
    Ocr::new(OcrOptions {
      // target_languages: vec!["en-US", "zh-Hans", "ja-JP"],
      target_languages: vec!["ja-JP"],
    })
  })
}

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

pub use utils::setup_mask;
