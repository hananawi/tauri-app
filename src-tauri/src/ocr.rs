use tauri::Runtime;

mod detect_text;
mod utils;

pub struct Ocr {
    options: OcrOptions,
}

pub struct OcrOptions {
    target_languages: Vec<&'static str>,
}

impl Ocr {
    pub fn new(options: OcrOptions) -> Self {
        Self { options }
    }
}

#[tauri::command]
pub async fn detect_text<R: Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), String> {
    let ocr = Ocr::new(OcrOptions {
        target_languages: vec!["ja-JP"],
    });

    ocr.detect_text();

    Ok(())
}
