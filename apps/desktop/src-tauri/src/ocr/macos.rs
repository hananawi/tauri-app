//! macOS 平台实现：ScreenCaptureKit 抓屏 + Vision OCR。

mod capture;
mod detect;
mod tray_fix;

use block2::RcBlock;
use objc2::{define_class, AnyThread, ClassType, MainThreadOnly};
use objc2_app_kit::NSPanel;
use objc2_vision::VNRecognizeTextRequest;

pub use capture::{capture_fullscreen, png_to_clipboard};
pub use detect::detect_text;
pub use tray_fix::install_tray_click_fix;

define_class!(
  /// NSPanel 子类：无边框窗口默认不能成为 key window，覆写放行，
  /// 蒙层（borderless）才能收到键盘事件。
  #[unsafe(super(NSPanel))]
  #[thread_kind = MainThreadOnly]
  #[name = "ClipPanel"]
  struct ClipPanel;

  impl ClipPanel {
    #[unsafe(method(canBecomeKeyWindow))]
    fn can_become_key_window(&self) -> bool {
      true
    }
  }
);

extern "C" {
  /// libobjc 运行时函数：就地替换对象的类。
  fn object_setClass(
    obj: *mut objc2::runtime::AnyObject,
    cls: *const objc2::runtime::AnyClass,
  ) -> *const objc2::runtime::AnyClass;
}

/// 把 tao 创建的 clip NSWindow 就地转换成 nonactivating NSPanel。
/// **须在主线程、窗口首次显示前调用一次。**
///
/// 原因：常规 NSWindow 要成为 key window 必须激活整个 app，而实测（窗口服务器
/// SLSCopySpacesForWindows 的 Space 分配）激活动作会让窗口被排除在其他 app 的
/// 全屏 Space 之外，有时还把系统切回桌面 Space。nonactivating panel 不激活
/// 进程即可拿键盘焦点，是盖全屏 Space 的标准做法（Spotlight 类工具同款）。
///
/// `object_setClass` 就地换类是 tauri-nspanel crate 验证过的手法：
/// ClipPanel 不新增实例变量，与原窗口内存布局兼容。
pub fn init_clip_panel(window: &tauri::WebviewWindow) -> Result<(), String> {
  use objc2_app_kit::NSWindowStyleMask;
  use objc2_foundation::MainThreadMarker;

  MainThreadMarker::new().ok_or("init_clip_panel 必须在主线程调用")?;
  let ns_ptr = window.ns_window().map_err(|e| e.to_string())?;
  unsafe {
    object_setClass(ns_ptr as *mut _, ClipPanel::class());
    let panel = &*(ns_ptr as *const NSPanel);
    // nonactivatingPanel 位仅对 NSPanel 合法，须在换类之后追加
    panel.setStyleMask(
      panel.styleMask() | NSWindowStyleMask::NonactivatingPanel,
    );
    // NSPanel 默认在 app 失活时隐藏；蒙层要一直挂着直到用户结束截图
    panel.setHidesOnDeactivate(false);
  }
  Ok(())
}

/// 定位蒙层窗口铺满目标屏、显示并拿键盘焦点。**须在主线程调用。**
///
/// 全程用原生 NSWindow 同步调用，不走 tauri 的窗口 API：tauri 的
/// `set_size`/`set_position`/`set_always_on_top`/`show`/`set_focus` 都是异步
/// 派发到事件循环的，执行顺序与源码顺序脱节（实测排队的 `set_always_on_top`
/// 会在我们直接 `setLevel(101)` 之后才执行，把层级重置回 5）。
///
/// 盖住其他 app 的原生全屏 Space 需要几件事齐备：
/// - 窗口是 nonactivating NSPanel（见 `init_clip_panel`），全程**不激活** app；
/// - collectionBehavior 含 `CanJoinAllSpaces | FullScreenAuxiliary`
///   （全屏 app 独占 Space，缺 aux 位窗口会被排除在外）；
/// - `orderFrontRegardless`：进程未激活时 `makeKeyAndOrderFront` 不保证
///   把窗口排上当前 Space；
/// - 层级高于全屏窗口（用 PopUpMenu=101，顺带盖住普通桌面的菜单栏和 Dock，
///   与冻屏底图对齐）。
pub fn present_clip_window(
  window: &tauri::WebviewWindow,
  monitor: &tauri::Monitor,
) -> Result<(), String> {
  use objc2_app_kit::{
    NSPopUpMenuWindowLevel, NSScreen, NSWindow, NSWindowCollectionBehavior,
  };
  use objc2_foundation::MainThreadMarker;

  let mtm =
    MainThreadMarker::new().ok_or("present_clip_window 必须在主线程调用")?;
  let ns_ptr = window.ns_window().map_err(|e| e.to_string())?;

  // 找目标 Monitor 对应的 NSScreen。tao 的 Monitor.position = CGDisplayBounds
  // 原点（点，全局左上原点）× 缩放比；NSScreen.frame 是全局左下原点，
  // 按「主屏高度翻转 y」换算回去比对。
  let screens = NSScreen::screens(mtm);
  let primary_height = screens
    .iter()
    .next()
    .map(|s| s.frame().size.height)
    .ok_or("找不到任何 NSScreen")?;
  let target_screen = screens
    .iter()
    .find(|s| {
      let frame = s.frame();
      let scale = s.backingScaleFactor();
      let cg_x = frame.origin.x;
      let cg_y = primary_height - (frame.origin.y + frame.size.height);
      ((cg_x * scale) - monitor.position().x as f64).abs() <= 1.0
        && ((cg_y * scale) - monitor.position().y as f64).abs() <= 1.0
    })
    .or_else(|| screens.iter().next())
    .ok_or("找不到任何 NSScreen")?;

  unsafe {
    let ns_window = &*(ns_ptr as *const NSWindow);
    ns_window.setFrame_display(target_screen.frame(), true);
    ns_window.setCollectionBehavior(
      NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary,
    );
    ns_window.setLevel(NSPopUpMenuWindowLevel);
    ns_window.orderFrontRegardless();
    // nonactivating panel：makeKey 不会激活本进程，避免触发 Space 切换/排斥
    ns_window.makeKeyAndOrderFront(None);
    // 把首个响应者交给 webview，确保面板未激活进程也能收到按键
    if let Some(content) = ns_window.contentView() {
      ns_window.makeFirstResponder(Some(&content));
    }
  }
  Ok(())
}

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
