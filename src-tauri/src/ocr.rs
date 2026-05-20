//! OCR / 截图模块的跨平台门面。
//!
//! 公共类型（`Rect`、`PixelRect`、`DetectionResultItem`、`OcrOptions`）放在
//! 这里，实际实现按 OS 分发到 `macos` / `windows` 子模块。
//!
//! 截图采用「冻屏」模式：触发时先抓整屏存内存（`show_clip`），用户在静态图
//! 上框选，再按选区像素裁剪（`crop_png`）。这样彻底避开「按屏幕坐标重新抓屏」
//! 的坐标 / HiDPI 换算问题，也能盖住 macOS 全屏 app 与 Windows flip-model 全屏。

use std::io::Cursor;
use std::sync::{mpsc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

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

/// 选区在冻屏图上的像素坐标（前端按缩放比换算后传入）。
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct PixelRect {
  pub x: u32,
  pub y: u32,
  pub width: u32,
  pub height: u32,
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

/// 启动一次截图：抓光标所在屏的整屏冻帧存入 `AppState.frozen_capture`
/// → 蒙层窗口铺满该屏并显示。
///
/// **必须在后台线程调用。** 抓屏要阻塞等 ScreenCaptureKit 回调，而该回调依赖
/// 主 run loop 继续转；若在主线程上阻塞，回调永远不来 → 死锁。窗口尺寸/位置/
/// 显示等操作反过来要求主线程，故用 `run_on_main_blocking` 切回主线程做。
pub fn show_clip(app: &AppHandle) -> Result<(), String> {
  // 1. 主线程上找光标所在屏。
  let monitor = run_on_main_blocking(app, {
    let app = app.clone();
    move || target_monitor(&app)
  })??;

  // 2. 后台线程抓整屏（窗口此时仍隐藏，截图不含蒙层本身）。
  let png = imp::capture_fullscreen(&monitor)?;

  // 3. 存入 AppState，供 clipimg 协议与命令层裁剪使用。
  {
    let state = app.state::<Mutex<AppState>>();
    state.lock().map_err(|e| e.to_string())?.frozen_capture = Some(png);
  }

  // 4. 主线程定位并显示蒙层窗口。
  run_on_main_blocking(app, {
    let app = app.clone();
    let monitor = monitor.clone();
    move || show_mask_window(&app, &monitor)
  })?
}

/// 把闭包丢到主线程执行并阻塞等返回值。**只能从非主线程调用**——主线程上调用
/// 会因为等自己排队的闭包而死锁。
fn run_on_main_blocking<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
  T: Send + 'static,
  F: FnOnce() -> T + Send + 'static,
{
  let (tx, rx) = mpsc::channel();
  app
    .run_on_main_thread(move || {
      let _ = tx.send(f());
    })
    .map_err(|e| e.to_string())?;
  rx.recv().map_err(|e| e.to_string())
}

/// 定位 `clip` 蒙层窗口铺满目标屏并显示。须在主线程调用。
fn show_mask_window(
  app: &AppHandle,
  monitor: &tauri::Monitor,
) -> Result<(), String> {
  let window = app
    .get_webview_window("clip")
    .ok_or("clip window not found")?;
  position_window(&window, monitor)?;
  app.emit("window-will-show", ()).map_err(|e| e.to_string())?;
  window.show().map_err(|e| e.to_string())?;
  window.set_focus().map_err(|e| e.to_string())?;
  Ok(())
}

/// 找鼠标所在屏；找不到就退回主屏（第一个）。坐标用物理像素比较，
/// mac / windows 在 HiDPI 下口径一致。
fn target_monitor(app: &AppHandle) -> Result<tauri::Monitor, String> {
  let cursor = app.cursor_position().map_err(|e| e.to_string())?;
  let monitors = app.available_monitors().map_err(|e| e.to_string())?;
  monitors
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
    .cloned()
    .ok_or_else(|| "找不到任何显示器".to_string())
}

/// 把 `clip` 蒙层窗口铺满目标显示器。
fn position_window(
  window: &tauri::WebviewWindow,
  monitor: &tauri::Monitor,
) -> Result<(), String> {
  use tauri::{PhysicalPosition, PhysicalSize};

  window
    .set_size(PhysicalSize::new(
      monitor.size().width,
      monitor.size().height,
    ))
    .map_err(|e| e.to_string())?;
  window
    .set_position(PhysicalPosition::new(
      monitor.position().x,
      monitor.position().y,
    ))
    .map_err(|e| e.to_string())?;
  window.set_always_on_top(true).map_err(|e| e.to_string())?;
  // macOS 上全屏 app 处于独立的 Space，蒙层窗口默认只在自己的 Space 显示，
  // 盖不住全屏应用。让它加入所有 Space（含全屏 Space），才能覆盖全屏 app。
  window
    .set_visible_on_all_workspaces(true)
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// 把冻屏整图按像素选区裁剪，返回裁剪后的 PNG。选区会被夹到图像范围内。
pub fn crop_png(png: &[u8], rect: PixelRect) -> Result<Vec<u8>, String> {
  let img = image::load_from_memory(png)
    .map_err(|e| format!("解码冻屏图失败：{e}"))?;
  let (iw, ih) = (img.width(), img.height());
  if iw == 0 || ih == 0 {
    return Err("冻屏图为空".to_string());
  }

  let x = rect.x.min(iw - 1);
  let y = rect.y.min(ih - 1);
  let w = rect.width.min(iw - x);
  let h = rect.height.min(ih - y);
  if w == 0 || h == 0 {
    return Err("截图区域为空".to_string());
  }

  let cropped = img.crop_imm(x, y, w, h);
  let mut out = Vec::new();
  cropped
    .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
    .map_err(|e| format!("编码截图失败：{e}"))?;
  Ok(out)
}

/// 在一张 PNG 截图上识别文字。`display_*` 为选区在屏幕上的逻辑尺寸，用于把
/// Vision 的归一化坐标换算回前端可直接渲染的坐标。
pub fn detect_text(
  png: &[u8],
  display_width: f64,
  display_height: f64,
  options: &OcrOptions,
) -> Vec<DetectionResultItem> {
  imp::detect_text(png, display_width, display_height, options)
}

/// 把 PNG 字节写入系统剪贴板。
pub fn png_to_clipboard(png: &[u8]) -> Result<(), String> {
  imp::png_to_clipboard(png)
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
