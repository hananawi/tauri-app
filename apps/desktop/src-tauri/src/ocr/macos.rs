//! macOS 平台实现：ScreenCaptureKit 抓屏 + Vision OCR。

mod capture;
mod detect;
mod tray_fix;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_vision::VNRecognizeTextRequest;

pub use capture::{capture_fullscreen, png_to_clipboard};
pub use detect::detect_text;
pub use tray_fix::install_tray_click_fix;

/// 预热 Vision：构造一个 `VNRecognizeTextRequest` 并打印支持的识别语言。
/// 第一次构造 Vision 请求会触发框架内部的语言模型加载，提前做掉避免
/// 用户首次按下截图快捷键时卡顿。
/// 把冻屏蒙层窗口切到前台并交出键盘焦点。macOS 上 `set_focus` 已能可靠激活
/// accessory app 的窗口，无需像 Windows 那样绕系统的前台限制。
pub fn focus_clip_window(
  window: &tauri::WebviewWindow,
) -> Result<(), String> {
  window.set_focus().map_err(|e| e.to_string())
}

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
