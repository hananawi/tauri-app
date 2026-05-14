use tauri::{AppHandle, Emitter, Manager};

pub fn show_window(app: &AppHandle, label: &str) -> Result<(), String> {
  let window = app
    .get_webview_window(label)
    .ok_or_else(|| format!("找不到窗口：{label}"))?;
  window.show().map_err(|e| e.to_string())?;
  window.set_focus().map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn open_llm_result_window(app: AppHandle) -> Result<(), String> {
  show_window(&app, "llm-result")?;
  app
    .emit("llm-result:refresh", ())
    .map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
  show_window(&app, "settings")
}
