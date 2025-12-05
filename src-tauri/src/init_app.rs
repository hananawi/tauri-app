use std::sync::Mutex;

use block2::RcBlock;
use objc2::AnyThread;
use objc2_vision::VNRecognizeTextRequest;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager,
};

use crate::store::AppState;

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
    let escape_shortcut = Shortcut::new(None, Code::Escape);
    app.handle().plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([clip_shortcut, escape_shortcut])
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
              } else if shortcut == &escape_shortcut {
                if state.is_clipping {
                  state.set_is_clipping(app, false);
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
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
  }

  let quit_item = MenuItem::with_id(app, "quit", "&Quit", true, None::<&str>)?;
  let clip_item = MenuItem::with_id(app, "clip", "&Clip", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&clip_item, &quit_item])?;

  TrayIconBuilder::new()
    .menu(&menu)
    .icon(app.default_window_icon().unwrap().clone())
    .show_menu_on_left_click(true)
    .on_tray_icon_event(|tray, event| match event {
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
      _ => {}
    })
    .build(app)?;

  Ok(())
}
