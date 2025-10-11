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
use objc2_foundation::{NSDictionary, NSError};
use objc2_screen_capture_kit::SCScreenshotManager;

use crate::ocr::Ocr;

impl Ocr {
    pub fn capture_screen(&self, rect: CGRect) {
        ensure_screen_permission().unwrap();

        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        unsafe {
            let completion_tx = tx.clone();
            let shot_cb = RcBlock::new(
                move |img_ptr: *mut CGImage, err_ptr: *mut NSError| {
                    if !err_ptr.is_null() {
                        eprintln!("Screenshot error: {:#?}", &*err_ptr);
                        let _ = completion_tx
                            .send(Err("截图失败：系统返回错误".to_string()));
                        return;
                    }

                    if img_ptr.is_null() {
                        eprintln!("Screenshot returned null image pointer");
                        let _ = completion_tx
                            .send(Err("截图失败：未获取到图像".to_string()));
                        return;
                    }

                    let img_ref = &*img_ptr;
                    let bitmap = NSBitmapImageRep::initWithCGImage(
                        NSBitmapImageRep::alloc(),
                        img_ref,
                    );
                    let props = NSDictionary::new();

                    let Some(png_data) = bitmap
                        .representationUsingType_properties(
                            NSBitmapImageFileType::PNG,
                            &props,
                        )
                    else {
                        eprintln!("Failed to encode screenshot as PNG");
                        let _ = completion_tx
                            .send(Err("截图失败：无法编码图像".to_string()));
                        return;
                    };

                    let pasteboard = NSPasteboard::generalPasteboard();
                    pasteboard.clearContents();

                    if !pasteboard
                        .setData_forType(Some(&png_data), NSPasteboardTypePNG)
                    {
                        eprintln!(
                            "Failed to write screenshot data to pasteboard"
                        );
                        let _ = completion_tx
                            .send(Err("截图失败：无法写入剪切板".to_string()));
                        return;
                    }

                    let _ = completion_tx.send(Ok(()));
                },
            );

            SCScreenshotManager::captureImageInRect_completionHandler(
                rect,
                Some(&shot_cb),
            );
        }

        match rx.recv() {
            Ok(Ok(())) => (),
            Ok(Err(err)) => eprintln!("{err}"),
            Err(recv_err) => {
                eprintln!("Failed to receive screenshot result: {recv_err}")
            }
        }
    }
}

fn ensure_screen_permission() -> Result<(), &'static str> {
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            println!(
                    "Requesting Screen Recording permission...\n> System Settings → Privacy & Security → Screen & System Audio Recording → enable your terminal (e.g., Terminal/iTerm) → restart this app"
                );
            CGRequestScreenCaptureAccess();

            return Err("Permission not granted yet. Please grant and re-run.");
        }
    }

    Ok(())
}
