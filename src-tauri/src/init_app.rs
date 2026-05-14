use std::sync::Mutex;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_vision::VNRecognizeTextRequest;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager,
};

use crate::state::AppState;

pub fn init_app(
  app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
  unsafe {
    let ocr_req = VNRecognizeTextRequest::initWithCompletionHandler(
      VNRecognizeTextRequest::alloc(),
      RcBlock::as_ptr(&RcBlock::new(|_req, _error| {})),
    );
    println!(
      "supported languages: {:#?}",
      ocr_req.supportedRecognitionLanguagesAndReturnError()
    );
  }

  #[cfg(desktop)]
  {
    use tauri_plugin_global_shortcut::{
      Code, Modifiers, Shortcut, ShortcutState,
    };

    let clip_shortcut =
      Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR);
    app.handle().plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([clip_shortcut])
        .unwrap()
        .with_handler(move |app, shortcut, event| {
          println!("shortcut pressed {shortcut:?}");

          match event.state() {
            ShortcutState::Released => {
              let state = app.state::<Mutex<AppState>>();
              let mut state = state.lock().unwrap();

              if shortcut == &clip_shortcut {
                if !state.is_clipping {
                  state.set_is_clipping(app, true);
                }
              }
            }
            _ => {}
          }
        })
        .build(),
    )?;
  }

  #[cfg(target_os = "macos")]
  {
    use core::ptr::NonNull;

    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSEvent, NSEventMask};

    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    // tray-icon 在状态栏按钮上盖了一层自定义 NSView 来捕获鼠标事件。
    // accessory app 平时处于非活跃状态，第一次点击会同时触发「激活 app」
    // 和「弹出菜单」，激活动作会把刚弹出的菜单立刻关掉（表现为闪一下）。
    // 装一个本地鼠标监听，在事件派发到状态栏之前抢先激活 app，菜单就能正常停留。
    if let Some(mtm) = MainThreadMarker::new() {
      let handler =
        RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
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
  }

  let quit_item = MenuItem::with_id(app, "quit", "&Quit", true, None::<&str>)?;
  let clip_item = MenuItem::with_id(app, "clip", "&Clip", true, None::<&str>)?;
  let settings_item =
    MenuItem::with_id(app, "settings", "&Settings", true, None::<&str>)?;
  let menu =
    Menu::with_items(app, &[&clip_item, &settings_item, &quit_item])?;

  TrayIconBuilder::new()
    .menu(&menu)
    .icon(app.default_window_icon().unwrap().clone())
    .show_menu_on_left_click(true)
    .on_tray_icon_event(|_tray, event| match event {
      TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Down,
        ..
      } => {
        println!("left click pressed and released");
      }
      _ => {
        // println!("unhandled event {event:?}");
      }
    })
    .on_menu_event(|app, event| match event.id.as_ref() {
      "quit" => app.exit(0),
      "clip" => {
        let state = app.state::<Mutex<AppState>>();
        let mut state = state.lock().unwrap();
        let is_clipping = state.is_clipping;
        if !is_clipping {
          state.set_is_clipping(app, true);
        }
      }
      "settings" => {
        if let Err(err) = crate::commands::show_window(app, "settings") {
          eprintln!("{err}");
        }
      }
      _ => {}
    })
    .build(app)?;

  Ok(())
}
