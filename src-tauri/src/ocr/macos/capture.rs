//! 用 ScreenCaptureKit 抓屏。冻屏模式下抓的是目标显示器的整屏。

use std::sync::mpsc;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_app_kit::{
  NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypePNG,
};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
  CGImage, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess,
};
use objc2_foundation::{NSData, NSDictionary, NSError};
use objc2_screen_capture_kit::SCScreenshotManager;

use super::super::Rect;

/// 抓取某个显示器的整屏，返回 PNG 字节。
pub fn capture_fullscreen(
  monitor: &tauri::Monitor,
) -> Result<Vec<u8>, String> {
  // SCScreenshotManager 的 rect 用「点」（逻辑坐标）。Tauri 给的是物理像素，
  // 除以缩放比换算成逻辑坐标。
  let scale = monitor.scale_factor();
  let pos = monitor.position();
  let size = monitor.size();
  let rect = Rect {
    x: pos.x as f64 / scale,
    y: pos.y as f64 / scale,
    width: size.width as f64 / scale,
    height: size.height as f64 / scale,
  };
  capture_rect_png(rect)
}

/// 抓取指定区域，返回 PNG 字节。
fn capture_rect_png(rect: Rect) -> Result<Vec<u8>, String> {
  ensure_screen_permission().map_err(|e| e.to_string())?;
  let cg_rect = rect_to_cg(rect);

  let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

  unsafe {
    let completion_tx = tx.clone();
    let shot_cb =
      RcBlock::new(move |img_ptr: *mut CGImage, err_ptr: *mut NSError| {
        if !err_ptr.is_null() {
          eprintln!("Screenshot error: {:#?}", &*err_ptr);
          let _ =
            completion_tx.send(Err("截图失败：系统返回错误".to_string()));
          return;
        }

        if img_ptr.is_null() {
          eprintln!("Screenshot returned null image pointer");
          let _ =
            completion_tx.send(Err("截图失败：未获取到图像".to_string()));
          return;
        }

        let img_ref = &*img_ptr;
        let bitmap = NSBitmapImageRep::initWithCGImage(
          NSBitmapImageRep::alloc(),
          img_ref,
        );
        let props = NSDictionary::new();

        let Some(png_data) = bitmap.representationUsingType_properties(
          NSBitmapImageFileType::PNG,
          &props,
        ) else {
          eprintln!("Failed to encode screenshot as PNG");
          let _ =
            completion_tx.send(Err("截图失败：无法编码图像".to_string()));
          return;
        };

        let _ = completion_tx.send(Ok(png_data.to_vec()));
      });

    SCScreenshotManager::captureImageInRect_completionHandler(
      cg_rect,
      Some(&shot_cb),
    );
  }

  match rx.recv() {
    Ok(result) => result,
    Err(recv_err) => {
      Err(format!("Failed to receive screenshot result: {recv_err}"))
    }
  }
}

/// 把 PNG 字节写入系统剪贴板。
pub fn png_to_clipboard(png: &[u8]) -> Result<(), String> {
  unsafe {
    let ns_data = NSData::with_bytes(png);
    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();

    if !pasteboard.setData_forType(Some(&ns_data), NSPasteboardTypePNG) {
      return Err("截图失败：无法写入剪切板".to_string());
    }
  }
  Ok(())
}

pub(super) fn rect_to_cg(rect: Rect) -> CGRect {
  CGRect::new(
    CGPoint { x: rect.x, y: rect.y },
    CGSize {
      width: rect.width,
      height: rect.height,
    },
  )
}

/// Vision 返回的边界框是相对于原图的归一化坐标（左下为原点）。
/// 转回截图区域内的像素坐标，并翻转 y 到左上原点。
pub(super) fn rect_from_normalized(
  cg_rect: CGRect,
  parent_px_rect: Rect,
) -> Rect {
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

fn ensure_screen_permission() -> Result<(), &'static str> {
  if !CGPreflightScreenCaptureAccess() {
    println!(
      "Requesting Screen Recording permission...\n> System Settings → Privacy & Security → Screen & System Audio Recording → enable your terminal (e.g., Terminal/iTerm) → restart this app"
    );
    CGRequestScreenCaptureAccess();
    return Err("Permission not granted yet. Please grant and re-run.");
  }
  Ok(())
}
