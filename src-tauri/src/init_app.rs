use std::sync::Mutex;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager,
};

use crate::ocr;
use crate::state::AppState;

pub fn init_app(
  app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
  // 预热平台 OCR 引擎（mac: 加载 Vision 语言模型；win: no-op）。
  ocr::warmup();

  #[cfg(desktop)]
  register_global_shortcut(app)?;

  #[cfg(target_os = "macos")]
  setup_macos_specific(app);

  build_tray(app)?;

  Ok(())
}

#[cfg(desktop)]
fn register_global_shortcut(
  app: &mut tauri::App,
) -> Result<(), Box<dyn std::error::Error>> {
  use tauri_plugin_global_shortcut::{
    Code, Modifiers, Shortcut, ShortcutState,
  };

  // 主修饰键在两个平台语义不一致：
  // mac 上 SUPER = Cmd（用户习惯），Windows 上 SUPER = Win 键（会和系统截图抢）。
  // 因此 Windows 走 Ctrl，mac 走 Cmd，都叠 Shift+R。
  #[cfg(target_os = "macos")]
  let primary_mod = Modifiers::SUPER | Modifiers::SHIFT;
  #[cfg(not(target_os = "macos"))]
  let primary_mod = Modifiers::CONTROL | Modifiers::SHIFT;

  let clip_shortcut = Shortcut::new(Some(primary_mod), Code::KeyR);

  app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_shortcuts([clip_shortcut])?
      .with_handler(move |app, shortcut, event| {
        println!("shortcut pressed {shortcut:?}");
        if matches!(event.state(), ShortcutState::Released)
          && shortcut == &clip_shortcut
        {
          let state = app.state::<Mutex<AppState>>();
          let mut state = state.lock().unwrap();
          if !state.is_clipping {
            state.set_is_clipping(app, true);
          }
        }
      })
      .build(),
  )?;
  Ok(())
}

#[cfg(target_os = "macos")]
fn setup_macos_specific(app: &mut tauri::App) {
  // 让 app 不出现在 Dock，只以托盘形式存在。
  app.set_activation_policy(tauri::ActivationPolicy::Accessory);

  // 修首次点击托盘菜单闪烁的问题（accessory app 特有）。
  ocr::install_tray_click_fix();
}

fn build_tray(app: &mut tauri::App) -> tauri::Result<()> {
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
    .on_tray_icon_event(|_tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Down,
        ..
      } = event
      {
        println!("left click pressed and released");
      }
    })
    .on_menu_event(|app, event| match event.id.as_ref() {
      "quit" => app.exit(0),
      "clip" => {
        let state = app.state::<Mutex<AppState>>();
        let mut state = state.lock().unwrap();
        if !state.is_clipping {
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
