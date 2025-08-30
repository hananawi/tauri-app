use std::{
    ptr::NonNull,
    sync::{mpsc, Arc, Mutex},
};

use block2::RcBlock;
use objc2::AnyThread;
use objc2_core_graphics::{
    CGDisplayBounds, CGImage, CGMainDisplayID, CGPreflightScreenCaptureAccess,
    CGRequestScreenCaptureAccess,
};
use objc2_foundation::{NSArray, NSDictionary, NSError};
use objc2_screen_capture_kit::SCScreenshotManager;
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation, VNRequest,
};

use crate::ocr::utils;

use super::Ocr;

impl Ocr {
    pub fn detect_text(self) {
        check_permission().unwrap();

        let objc2_options = utils::convert_options(self.options);
        let detected_texts: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![]));
        let (tx, rx) = mpsc::channel();

        unsafe {
            let shot_cb = RcBlock::new(move |img_ptr: *mut CGImage, err_ptr: *mut NSError| {
                if !err_ptr.is_null() {
                    eprintln!("Screenshot error: {:#?}", &*err_ptr);
                    tx.send(()).unwrap();
                    return;
                }

                if img_ptr.is_null() {
                    eprintln!("screen shot return null image");
                    tx.send(()).unwrap();
                    return;
                }

                let img_ref = &*img_ptr;
                let options = NSDictionary::new();
                let handler = VNImageRequestHandler::initWithCGImage_options(
                    VNImageRequestHandler::alloc(),
                    img_ref,
                    &options,
                );

                let detected_texts = Arc::clone(&detected_texts);
                let tx_inner = tx.clone();
                let ocr_cb =
                    RcBlock::new(move |req_ptr: NonNull<VNRequest>, err_ptr: *mut NSError| {
                        if !err_ptr.is_null() {
                            eprint!("Vision error: {:#?}", &*err_ptr);
                            tx_inner.send(()).unwrap();
                            return;
                        }

                        let request = req_ptr.as_ref();
                        if let Some(results) = request.results() {
                            for result in results {
                                if let Some(text_obs) =
                                    result.downcast_ref::<VNRecognizedTextObservation>()
                                {
                                    if let Some(text) = text_obs.topCandidates(1).firstObject() {
                                        if let Ok(mut lock) = detected_texts.lock() {
                                            lock.push(text.string().to_string());
                                        }
                                    }
                                }
                            }
                        }

                        tx_inner.send(()).unwrap();
                    });

                let ocr_req = VNRecognizeTextRequest::initWithCompletionHandler(
                    VNRecognizeTextRequest::alloc(),
                    RcBlock::as_ptr(&ocr_cb),
                );

                ocr_req.setUsesLanguageCorrection(true);
                ocr_req.setRecognitionLanguages(&objc2_options.target_languages);

                if let Err(error) =
                    handler.performRequests_error(&NSArray::from_retained_slice(&[ocr_req
                        .into_super()
                        .into_super()]))
                {
                    eprintln!("perform requests error: {:#?}", error);
                    tx.send(()).unwrap();
                    return;
                }
            });

            let rect = CGDisplayBounds(CGMainDisplayID());
            SCScreenshotManager::captureImageInRect_completionHandler(rect, Some(&shot_cb));
        }

        rx.recv().unwrap();
    }
}

fn check_permission() -> Result<(), &'static str> {
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
