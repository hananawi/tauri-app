use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
  fs::write(PathBuf::from(&path), contents)
    .map_err(|e| format!("写入文件失败：{e}"))
}
