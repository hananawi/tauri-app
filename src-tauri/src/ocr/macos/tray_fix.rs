//! 修 accessory app 首次点击托盘菜单闪退的问题。
//!
//! `tray-icon` 在状态栏按钮上盖了一层自定义 NSView 来捕获鼠标事件。
//! accessory app 平时处于非活跃状态，第一次点击会同时触发「激活 app」
//! 和「弹出菜单」，激活动作会把刚弹出的菜单立刻关掉（表现为闪一下）。
//! 装一个本地鼠标监听，在事件派发到状态栏之前抢先激活 app，菜单就能正常停留。

use core::ptr::NonNull;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSEvent, NSEventMask};

pub fn install_tray_click_fix() {
  let Some(mtm) = MainThreadMarker::new() else {
    return;
  };
  let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
    NSApplication::sharedApplication(mtm).activate();
    event.as_ptr()
  });
  let monitor = unsafe {
    NSEvent::addLocalMonitorForEventsMatchingMask_handler(
      NSEventMask::LeftMouseDown,
      &handler,
    )
  };
  // 监听需要存活整个 app 生命周期
  std::mem::forget(monitor);
}
