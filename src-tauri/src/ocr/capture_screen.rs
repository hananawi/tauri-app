use std::sync::mpsc;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_app_kit::{
  NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypePNG,
};
use objc2_core_foundation::CGRect;
use objc2_core_graphics::{
  CGImage, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess,
};
use objc2_foundation::{NSData, NSDictionary, NSError};
use objc2_screen_capture_kit::SCScreenshotManager;

use super::Ocr;

impl Ocr {
  /// 截取指定区域，返回 PNG 编码后的字节。
  pub fn capture_screen_png(&self, rect: CGRect) -> Result<Vec<u8>, String> {
    ensure_screen_permission().map_err(|e| e.to_string())?;

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
        rect,
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

  /// 截图并写入系统剪贴板。
  pub fn capture_screen(&self, rect: CGRect) {
    let png_data = match self.capture_screen_png(rect) {
      Ok(data) => data,
      Err(err) => {
        eprintln!("{err}");
        return;
      }
    };

    unsafe {
      let ns_data = NSData::with_bytes(&png_data);
      let pasteboard = NSPasteboard::generalPasteboard();
      pasteboard.clearContents();

      if !pasteboard.setData_forType(Some(&ns_data), NSPasteboardTypePNG) {
        eprintln!("截图失败：无法写入剪切板");
      }
    }
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
