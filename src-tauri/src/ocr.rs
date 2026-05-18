//! OCR / 截图模块的跨平台门面。
//!
//! 公共类型（`Rect`、`DetectionResultItem`、`OcrOptions`）放在这里，
//! 实际实现按 OS 分发到 `macos` / `windows` 子模块。业务侧只调
//! `ocr::capture_screen_png(...)`、`ocr::detect_text(...)` 等函数，不感知平台。

use serde::{Deserialize, Serialize};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as imp;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as imp;

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DetectionResultItem {
  pub text: String,
  pub rect: Rect,
}

#[derive(Clone)]
pub struct OcrOptions {
  pub target_languages: Vec<&'static str>,
}

/// 默认 OCR 配置。后续若要做"识别语言"的设置项，从这里读出来再注入。
pub fn default_options() -> OcrOptions {
  OcrOptions {
    // target_languages: vec!["en-US", "zh-Hans", "ja-JP"],
    target_languages: vec!["ja-JP"],
  }
}

/// 截屏指定区域，返回 PNG 字节。
pub fn capture_screen_png(rect: Rect) -> Result<Vec<u8>, String> {
  imp::capture_screen_png(rect)
}

/// 截屏并写入系统剪贴板。
pub fn capture_screen_to_clipboard(rect: Rect) -> Result<(), String> {
  imp::capture_screen_to_clipboard(rect)
}

/// 在截图区域内识别文字。
pub fn detect_text(rect: Rect, options: &OcrOptions) -> Vec<DetectionResultItem> {
  imp::detect_text(rect, options)
}

/// 进程启动时的预热（mac 上预热 Vision，避免首次截图卡顿；Windows 暂为 no-op）。
pub fn warmup() {
  imp::warmup();
}

/// mac 专属：装一个本地 NSEvent 监听，修掉 accessory app 首次点击托盘菜单闪退的问题。
/// Windows 上不需要，函数本身在 windows.rs 里也是 no-op。
pub fn install_tray_click_fix() {
  imp::install_tray_click_fix();
}

/// 把 `clip` 蒙层窗口移动到鼠标所在屏幕、铺满该屏。
///
/// 跨平台实现：用 Tauri 自带的 `cursor_position()` + `available_monitors()`，
/// 不再依赖 `NSScreen` / Win32。在 mac 主线程要求下用 `run_on_main_thread` 回到主线程。
pub fn setup_mask(app: tauri::AppHandle) -> Result<(), String> {
  if app
    .run_on_main_thread({
      let app = app.clone();
      move || {
        if let Err(err) = setup_mask_inner(&app) {
          eprintln!("setup_mask failed: {err}");
        }
      }
    })
    .is_err()
  {
    return setup_mask_inner(&app);
  }
  Ok(())
}

fn setup_mask_inner(app: &tauri::AppHandle) -> Result<(), String> {
  use tauri::{Manager, PhysicalPosition, PhysicalSize};

  let window = app
    .get_webview_window("clip")
    .ok_or("clip window not found")?;

  let cursor = app.cursor_position().map_err(|e| e.to_string())?;
  let monitors = app.available_monitors().map_err(|e| e.to_string())?;

  // 找鼠标所在屏；找不到就退回主屏（第一个）。坐标都用物理像素比较，
  // mac / windows 在 HiDPI 下口径一致。
  let target = monitors
    .iter()
    .find(|m| {
      let pos = m.position();
      let size = m.size();
      cursor.x >= pos.x as f64
        && cursor.x < pos.x as f64 + size.width as f64
        && cursor.y >= pos.y as f64
        && cursor.y < pos.y as f64 + size.height as f64
    })
    .or_else(|| monitors.first())
    .ok_or("找不到任何显示器")?;

  window
    .set_size(PhysicalSize::new(target.size().width, target.size().height))
    .map_err(|e| e.to_string())?;
  window
    .set_position(PhysicalPosition::new(
      target.position().x,
      target.position().y,
    ))
    .map_err(|e| e.to_string())?;
  window.set_always_on_top(true).map_err(|e| e.to_string())?;

  Ok(())
}
