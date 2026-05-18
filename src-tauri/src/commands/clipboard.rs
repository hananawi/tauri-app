use arboard::Clipboard;

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
  let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
  clipboard
    .set_text(text)
    .map_err(|e| format!("无法写入剪贴板：{e}"))?;
  Ok(())
}
