//! macOS 平台实现：ScreenCaptureKit 截图 + Vision OCR。

mod capture;
mod detect;
mod tray_fix;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_vision::VNRecognizeTextRequest;

pub use capture::{capture_screen_png, capture_screen_to_clipboard};
pub use detect::detect_text;
pub use tray_fix::install_tray_click_fix;

/// 预热 Vision：构造一个 `VNRecognizeTextRequest` 并打印支持的识别语言。
/// 第一次构造 Vision 请求会触发框架内部的语言模型加载，提前做掉避免
/// 用户首次按下截图快捷键时卡顿。
pub fn warmup() {
  unsafe {
    let req = VNRecognizeTextRequest::initWithCompletionHandler(
      VNRecognizeTextRequest::alloc(),
      RcBlock::as_ptr(&RcBlock::new(|_req, _error| {})),
    );
    println!(
      "supported languages: {:#?}",
      req.supportedRecognitionLanguagesAndReturnError()
    );
  }
}
