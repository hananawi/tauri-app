use std::sync::Mutex;

use tauri::Manager;

use crate::state::AppState;

#[tauri::command]
pub fn stop_clipping(app: tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<Mutex<AppState>>();
  let mut state = state.lock().map_err(|e| e.to_string())?;
  if state.is_clipping {
    state.set_is_clipping(&app, false);
  }
  Ok(())
}
