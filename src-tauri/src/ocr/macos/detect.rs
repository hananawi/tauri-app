//! 用 Vision (`VNRecognizeTextRequest`) 在截屏上识别文字。

use std::{
  ptr::NonNull,
  sync::{mpsc, Arc, Mutex},
};

use block2::RcBlock;
use objc2::{rc::Retained, AnyThread};
use objc2_core_graphics::{
  CGImage, CGPreflightScreenCaptureAccess, CGRequestScreenCaptureAccess,
};
use objc2_foundation::{NSArray, NSDictionary, NSError, NSString};
use objc2_screen_capture_kit::SCScreenshotManager;
use objc2_vision::{
  VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation,
  VNRequest,
};

use super::super::{DetectionResultItem, OcrOptions, Rect};
use super::capture::{rect_from_normalized, rect_to_cg};

pub fn detect_text(
  rect: Rect,
  options: &OcrOptions,
) -> Vec<DetectionResultItem> {
  if let Err(err) = check_permission() {
    eprintln!("{err}");
    return Vec::new();
  }

  let cg_rect = rect_to_cg(rect);
  let target_languages = build_languages_array(&options.target_languages);

  let detected: Arc<Mutex<Vec<DetectionResultItem>>> =
    Arc::new(Mutex::new(vec![]));
  let detected_weak = Arc::downgrade(&detected);
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

        let detected_for_cb = detected_weak.clone();
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
                  let mut text = String::new();
                  if let Some(t) = text_obs.topCandidates(1).firstObject() {
                    text = t.string().to_string();
                  }

                  let bbox = text_obs.boundingBox();
                  let bbox = rect_from_normalized(bbox, rect);

                  if let Some(lock) = detected_for_cb.upgrade() {
                    if let Ok(mut lock) = lock.lock() {
                      lock.push(DetectionResultItem { text, rect: bbox });
                    }
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
        ocr_req.setRecognitionLanguages(&target_languages);

        if let Err(error) =
          handler.performRequests_error(&NSArray::from_retained_slice(&[
            ocr_req.into_super().into_super(),
          ]))
        {
          eprintln!("perform requests error: {:#?}", error);
          tx.send(()).unwrap();
        }
      });

    SCScreenshotManager::captureImageInRect_completionHandler(
      cg_rect,
      Some(&shot_cb),
    );
  }

  rx.recv().unwrap();

  Arc::try_unwrap(detected)
    .expect("还有其他 Arc 强引用在活着")
    .into_inner()
    .unwrap()
}

fn build_languages_array(
  langs: &[&'static str],
) -> Retained<NSArray<NSString>> {
  langs.iter().map(|s| NSString::from_str(s)).collect()
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
