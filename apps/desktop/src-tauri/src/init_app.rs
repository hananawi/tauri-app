use std::sync::Mutex;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager,
};

use crate::ocr;
use crate::state::AppState;

/// 与前端 src/lib/settings.ts 的 DEFAULT_CLIP_SHORTCUT 保持一致。
pub const DEFAULT_CLIP_SHORTCUT_STR: &str = "CommandOrControl+Shift+KeyR";

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
  use std::str::FromStr;
  use tauri_plugin_global_shortcut::{
    GlobalShortcutExt, Shortcut, ShortcutState,
  };

  // 注册插件（带统一 handler）：之后通过 global_shortcut().register/unregister 动态增删快捷键。
  app.handle().plugin(
    tauri_plugin_global_shortcut::Builder::new()
      .with_handler(move |app, _shortcut, event| {
        if matches!(event.state(), ShortcutState::Released) {
          let state = app.state::<Mutex<AppState>>();
          let mut state = state.lock().unwrap();
          if !state.is_clipping {
            state.set_is_clipping(app, true);
          } else {
            // 已在截图中：不重复触发冻屏，改为通知前端确认当前选区进入下一步。
            let _ = app.emit("clip-shortcut-again", ());
          }
        }
      })
      .build(),
  )?;

  let default_shortcut = Shortcut::from_str(DEFAULT_CLIP_SHORTCUT_STR)
    .expect("默认快捷键应可解析");
  let saved = read_saved_clip_shortcut(app)
    .and_then(|s| Shortcut::from_str(&s).ok());
  let preferred = saved.unwrap_or(default_shortcut);

  let gs = app.global_shortcut();
  let registered = match gs.register(preferred) {
    Ok(()) => preferred,
    Err(e) if preferred != default_shortcut => {
      eprintln!(
        "注册保存的快捷键失败 ({e})，回退到默认 {DEFAULT_CLIP_SHORTCUT_STR}"
      );
      gs.register(default_shortcut)?;
      default_shortcut
    }
    Err(e) => return Err(e.into()),
  };

  let state = app.state::<Mutex<AppState>>();
  state.lock().unwrap().current_clip_shortcut = Some(registered);

  Ok(())
}

fn read_saved_clip_shortcut(app: &tauri::App) -> Option<String> {
  use tauri_plugin_store::StoreExt;
  let store = app.store("settings.json").ok()?;
  let value = store.get("clipShortcut")?;
  value.as_str().map(|s| s.to_string())
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
