//! 用 Vision (`VNRecognizeTextRequest`) 在一张 PNG 截图上识别文字。
//!
//! 冻屏模式下截图已抓好，这里直接对传入的 PNG 字节跑 Vision，不再自己抓屏，
//! 因此也不需要屏幕录制权限（权限只在抓屏那一步要）。

use std::{
  ptr::NonNull,
  sync::{mpsc, Arc, Mutex},
};

use block2::RcBlock;
use objc2::{rc::Retained, AnyThread};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSString};
use objc2_vision::{
  VNImageRequestHandler, VNRecognizeTextRequest, VNRecognizedTextObservation,
  VNRequest,
};

use super::super::{DetectionResultItem, OcrOptions, Rect};
use super::capture::rect_from_normalized;

pub fn detect_text(
  png: &[u8],
  display_width: f64,
  display_height: f64,
  options: &OcrOptions,
) -> Vec<DetectionResultItem> {
  // Vision 的归一化坐标按选区的逻辑显示尺寸还原，前端可直接拿来渲染浮层。
  let parent = Rect {
    x: 0.0,
    y: 0.0,
    width: display_width,
    height: display_height,
  };
  let target_languages = build_languages_array(&options.target_languages);

  let detected: Arc<Mutex<Vec<DetectionResultItem>>> =
    Arc::new(Mutex::new(vec![]));
  let detected_weak = Arc::downgrade(&detected);
  let (tx, rx) = mpsc::channel();

  unsafe {
    let ns_data = NSData::with_bytes(png);
    let img_options = NSDictionary::new();
    let handler = VNImageRequestHandler::initWithData_options(
      VNImageRequestHandler::alloc(),
      &ns_data,
      &img_options,
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

              let bbox =
                rect_from_normalized(text_obs.boundingBox(), parent);

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

    if let Err(error) = handler.performRequests_error(
      &NSArray::from_retained_slice(&[ocr_req.into_super().into_super()]),
    ) {
      eprintln!("perform requests error: {error:#?}");
      tx.send(()).unwrap();
    }
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
