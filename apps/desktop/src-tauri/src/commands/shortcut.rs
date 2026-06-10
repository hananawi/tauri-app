use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::state::AppState;

#[tauri::command]
pub fn update_clip_shortcut(
  app: AppHandle,
  shortcut: String,
) -> Result<(), String> {
  let new_shortcut = Shortcut::from_str(&shortcut)
    .map_err(|e| format!("无法解析快捷键 \"{shortcut}\"：{e}"))?;

  let state = app.state::<Mutex<AppState>>();
  let old = state.lock().map_err(|e| e.to_string())?.current_clip_shortcut;

  if old == Some(new_shortcut) {
    return Ok(());
  }

  let gs = app.global_shortcut();

  // 先尝试注册新快捷键；若失败则保留旧的，避免出现没有快捷键可用的窗口。
  gs.register(new_shortcut)
    .map_err(|e| format!("注册快捷键失败：{e}"))?;

  if let Some(old) = old {
    if let Err(e) = gs.unregister(old) {
      eprintln!("反注册旧快捷键失败：{e}");
    }
  }

  state
    .lock()
    .map_err(|e| e.to_string())?
    .current_clip_shortcut = Some(new_shortcut);

  Ok(())
}
