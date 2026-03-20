use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
use objc2_foundation::NSString;

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
  unsafe {
    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();
    let ns_string = NSString::from_str(&text);
    if !pasteboard.setString_forType(&ns_string, NSPasteboardTypeString) {
      return Err("无法写入剪贴板".to_string());
    }
  }
  Ok(())
}
