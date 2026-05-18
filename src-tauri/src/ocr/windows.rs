//! Windows 平台实现：
//! - 截图：xcap 拿到 RGBA 全屏图，按 rect 在 monitor 局部坐标内 crop。
//! - 剪贴板写图：arboard::Clipboard::set_image（直接吃 RGBA）。
//! - OCR：不做本地识别；Windows 走云端 LLM（DashScope / Claude vision），
//!   `detect_text` 直接返回空，前端不要走 OCR overlay 流程。
//!
//! 注意：rect 假定为虚拟桌面物理像素坐标（与前端 `winPos + selection` 一致）。
//! HiDPI 下前端有 logical/physical 混用的老问题，本模块不试图修。

use image::{GenericImageView, ImageEncoder, RgbaImage};

use super::{DetectionResultItem, OcrOptions, Rect};

pub fn capture_screen_png(rect: Rect) -> Result<Vec<u8>, String> {
  let img = capture_rect_rgba(rect)?;

  let mut bytes = Vec::with_capacity((img.width() * img.height() * 4) as usize);
  let encoder = image::codecs::png::PngEncoder::new(&mut bytes);
  encoder
    .write_image(
      img.as_raw(),
      img.width(),
      img.height(),
      image::ExtendedColorType::Rgba8,
    )
    .map_err(|e| format!("PNG 编码失败：{e}"))?;
  Ok(bytes)
}

pub fn capture_screen_to_clipboard(rect: Rect) -> Result<(), String> {
  let img = capture_rect_rgba(rect)?;
  let width = img.width() as usize;
  let height = img.height() as usize;
  let bytes = img.into_raw();

  let mut clipboard =
    arboard::Clipboard::new().map_err(|e| format!("打开剪贴板失败：{e}"))?;
  clipboard
    .set_image(arboard::ImageData {
      width,
      height,
      bytes: bytes.into(),
    })
    .map_err(|e| format!("无法写入剪贴板：{e}"))?;
  Ok(())
}

/// Windows 不做本地 OCR：识别需求统一走云端 LLM（详见 commands/llm.rs）。
/// 这里给一个明确日志，前端拿到空数组时不要展示 overlay。
pub fn detect_text(
  _rect: Rect,
  _options: &OcrOptions,
) -> Vec<DetectionResultItem> {
  eprintln!(
    "[ocr] Windows 不提供本地 OCR；请改用 LLM 截图问答（capture_to_temp + ask_llm_about_image）"
  );
  Vec::new()
}

/// 按 rect 找到对应 monitor，截全屏后 crop 出区域。
/// xcap 不同版本下 capture_region API 名字会变，全屏 + crop 最稳。
fn capture_rect_rgba(rect: Rect) -> Result<RgbaImage, String> {
  let monitors =
    xcap::Monitor::all().map_err(|e| format!("枚举显示器失败：{e}"))?;
  if monitors.is_empty() {
    return Err("找不到任何显示器".to_string());
  }

  let monitor = monitors
    .iter()
    .find(|m| {
      let mx = m.x() as f64;
      let my = m.y() as f64;
      let mw = m.width() as f64;
      let mh = m.height() as f64;
      rect.x >= mx
        && rect.x < mx + mw
        && rect.y >= my
        && rect.y < my + mh
    })
    .unwrap_or(&monitors[0]);

  let mx = monitor.x() as f64;
  let my = monitor.y() as f64;

  let full = monitor
    .capture_image()
    .map_err(|e| format!("xcap 截屏失败：{e}"))?;

  let local_x = (rect.x - mx).max(0.0).round() as u32;
  let local_y = (rect.y - my).max(0.0).round() as u32;
  let max_w = full.width().saturating_sub(local_x);
  let max_h = full.height().saturating_sub(local_y);
  let local_w = (rect.width.round() as u32).min(max_w);
  let local_h = (rect.height.round() as u32).min(max_h);

  if local_w == 0 || local_h == 0 {
    return Err("截图区域为空或越界".to_string());
  }

  let view = full.view(local_x, local_y, local_w, local_h);
  Ok(view.to_image())
}

pub fn warmup() {
  // no-op：Windows 不需要预热（不再有本地 OCR 引擎）。
}

pub fn install_tray_click_fix() {
  // no-op：托盘点击闪烁是 macOS accessory app 的问题，Windows 不需要。
}
