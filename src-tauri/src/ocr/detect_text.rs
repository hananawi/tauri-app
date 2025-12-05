use std::{
  ptr::NonNull,
  sync::{mpsc, Arc, Mutex},
};

use block2::RcBlock;
use objc2::AnyThread;
use objc2_core_graphics::{
  CGImage, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess,
};
use objc2_foundation::{NSArray, NSDictionary, NSError};
use objc2_screen_capture_kit::SCScreenshotManager;
use objc2_vision::{
  VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation,
  VNRequest,
};

use super::Ocr;
use crate::ocr::{utils, DetectionResultItem, Rect};

impl Ocr {
  pub fn detect_text(&self, rect: Rect) -> Vec<DetectionResultItem> {
    check_permission().unwrap();

    let cg_rect = rect.to_cg_rect();

    let detected_result_vec: Arc<Mutex<Vec<DetectionResultItem>>> =
      Arc::new(Mutex::new(vec![]));
    let detected_result_vec_for_cb = Arc::downgrade(&detected_result_vec);
    let objc2_options = utils::convert_options(self.options.clone());
    let (tx, rx) = mpsc::channel();

    unsafe {
      let shot_cb =
        RcBlock::new(move |img_ptr: *mut CGImage, err_ptr: *mut NSError| {
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

          let detected_texts_for_cb = detected_result_vec_for_cb.clone();
          let tx_for_cb = tx.clone();
          let ocr_cb = RcBlock::new(
            move |req_ptr: NonNull<VNRequest>, err_ptr: *mut NSError| {
              if !err_ptr.is_null() {
                eprint!("Vision error: {:#?}", &*err_ptr);
                tx_for_cb.send(()).unwrap();
                return;
              }

              let request = req_ptr.as_ref();
              if let Some(results) = request.results() {
                for result in results {
                  if let Some(text_obs) =
                    result.downcast_ref::<VNRecognizedTextObservation>()
                  {
                    let mut detected_text = String::new();

                    if let Some(text) = text_obs.topCandidates(1).firstObject()
                    {
                      detected_text = text.string().to_string();
                    }

                    let bounding_box = text_obs.boundingBox();
                    let bounding_box = Rect::from_cg_rect(bounding_box, &rect);

                    if let Ok(mut lock) =
                      detected_texts_for_cb.upgrade().unwrap().lock()
                    {
                      lock.push(DetectionResultItem {
                        text: detected_text,
                        rect: bounding_box,
                      });
                    }
                  }
                }
              }

              tx_for_cb.send(()).unwrap();
            },
          );

          let ocr_req = VNRecognizeTextRequest::initWithCompletionHandler(
            VNRecognizeTextRequest::alloc(),
            RcBlock::as_ptr(&ocr_cb),
          );

          ocr_req.setUsesLanguageCorrection(true);
          ocr_req.setRecognitionLanguages(&objc2_options.target_languages);

          if let Err(error) =
            handler.performRequests_error(&NSArray::from_retained_slice(&[
              ocr_req.into_super().into_super(),
            ]))
          {
            eprintln!("perform requests error: {:#?}", error);
            tx.send(()).unwrap();
            return;
          }
        });

      SCScreenshotManager::captureImageInRect_completionHandler(
        cg_rect,
        Some(&shot_cb),
      );
    }

    rx.recv().unwrap();

    println!(
      "detected_texts ref amount: {}",
      Arc::strong_count(&detected_result_vec)
    );

    Arc::try_unwrap(detected_result_vec)
      .expect("还有其他 Arc 强引用在活着")
      .into_inner()
      .unwrap()
  }
}

fn check_permission() -> Result<(), &'static str> {
  if !CGPreflightScreenCaptureAccess() {
    println!(
                    "Requesting Screen Recording permission...\n> System Settings → Privacy & Security → Screen & System Audio Recording → enable your terminal (e.g., Terminal/iTerm) → restart this app"
                );
    CGRequestScreenCaptureAccess();

    return Err("Permission not granted yet. Please grant and re-run.");
  }

  Ok(())
}
