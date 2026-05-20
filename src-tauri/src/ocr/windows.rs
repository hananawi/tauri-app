//! Windows 平台实现：
//! - 抓屏：xcap 抓目标显示器整屏，编码成 PNG（冻屏模式下用它当底图）。
//! - 剪贴板写图：PNG 解码成 RGBA 后交给 arboard。
//! - OCR：不做本地识别；Windows 走云端 LLM（DashScope / Claude vision），
//!   `detect_text` 直接返回空，前端不要走 OCR overlay 流程。

use image::{ImageEncoder, RgbaImage};

use super::{DetectionResultItem, OcrOptions};

/// 抓取某个显示器的整屏，返回 PNG 字节。
pub fn capture_fullscreen(
  monitor: &tauri::Monitor,
) -> Result<Vec<u8>, String> {
  // Tauri 给的是物理像素坐标，xcap 同样按物理像素枚举显示器。
  let pos = monitor.position();
  let monitors =
    xcap::Monitor::all().map_err(|e| format!("枚举显示器失败：{e}"))?;
  if monitors.is_empty() {
    return Err("找不到任何显示器".to_string());
  }

  let target = monitors
    .iter()
    .find(|m| {
      pos.x >= m.x()
        && pos.x < m.x() + m.width() as i32
        && pos.y >= m.y()
        && pos.y < m.y() + m.height() as i32
    })
    .unwrap_or(&monitors[0]);

  let img: RgbaImage = target
    .capture_image()
    .map_err(|e| format!("xcap 截屏失败：{e}"))?;

  let mut bytes =
    Vec::with_capacity((img.width() * img.height() * 4) as usize);
  image::codecs::png::PngEncoder::new(&mut bytes)
    .write_image(
      img.as_raw(),
      img.width(),
      img.height(),
      image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| format!("PNG 编码失败：{e}"))?;
  Ok(bytes)
}

/// 把 PNG 字节写入系统剪贴板（arboard 吃 RGBA，先解码）。
pub fn png_to_clipboard(png: &[u8]) -> Result<(), String> {
  let img = image::load_from_memory(png)
    .map_err(|e| format!("解码截图失败：{e}"))?
    .to_rgba8();
  let width = img.width() as usize;
  let height = img.height() as usize;

  let mut clipboard =
    arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败：{e}"))?;
  clipboard
    .set_image(arboard::ImageData {
      width,
      height,
      bytes: img.into_raw().into(),
    })
    .map_err(|e| format!("无法写入剪贴板：{e}"))?;
  Ok(())
}

/// Windows 不做本地 OCR：识别需求统一走云端 LLM（详见 commands/llm.rs）。
/// 这里给一个明确日志，前端拿到空数组时不要展示 overlay。
pub fn detect_text(
  _png: &[u8],
  _display_width: f64,
  _display_height: f64,
  _options: &OcrOptions,
) -> Vec<DetectionResultItem> {
  eprintln!(
    "[ocr] Windows 不提供本地 OCR；请改用 LLM 截图问答（save_capture_to_temp + ask_llm_about_image）"
  );
  Vec::new()
}

pub fn warmup() {
  // no-op：Windows 不需要预热（不再有本地 OCR 引擎）。
}

pub fn install_tray_click_fix() {
  // no-op：托盘点击闪烁是 macOS accessory app 的问题，Windows 不需要。
}
