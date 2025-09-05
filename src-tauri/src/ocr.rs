use tauri::Runtime;

mod capture_screen;
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
    println!("ocr start");

    let ocr = Ocr::new(OcrOptions {
        // target_languages: vec!["ja-JP"],
        target_languages: vec!["en-US"],
    });

    let text_vec = ocr.detect_text();

    println!("ocr end {text_vec:#?}");
    Ok(())
}

pub use capture_screen::setup_mask;
