use std::sync::OnceLock;

use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use serde::Deserialize;

mod capture_screen;
mod detect_text;
mod utils;

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

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

static OCR_INSTANCE: OnceLock<Ocr> = OnceLock::new();

fn ocr_singleton() -> &'static Ocr {
    OCR_INSTANCE.get_or_init(|| {
        Ocr::new(OcrOptions {
            // target_languages: vec!["en-US", "zh-CN", "ja-JP"],
            target_languages: vec!["zh-CN"],
        })
    })
}

#[tauri::command]
pub async fn detect_text(rect: Option<Rect>) -> Result<Vec<String>, String> {
    println!("ocr start");

    let ocr = ocr_singleton();

    let rect = rect.unwrap();
    let Rect {
        x,
        y,
        width,
        height,
    } = rect;
    let rect: CGRect = CGRect::new(CGPoint { x, y }, CGSize { width, height });

    let text_vec = ocr.detect_text(rect);

    println!("ocr end {text_vec:#?}");
    Ok(text_vec)
}

#[tauri::command]
pub async fn capture_screen(rect: Option<Rect>) -> Result<(), String> {
    let ocr = ocr_singleton();

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
