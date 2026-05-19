use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::Shortcut;

use crate::ocr::setup_mask;

pub struct AppState {
  pub is_clipping: bool,
  pub pending_llm_image: Option<String>,
  pub last_llm_image: Option<String>,
  pub current_clip_shortcut: Option<Shortcut>,
}

impl AppState {
  pub fn new() -> Self {
    Self {
      is_clipping: false,
      pending_llm_image: None,
      last_llm_image: None,
      current_clip_shortcut: None,
    }
  }

  pub fn set_pending_llm_image(&mut self, path: String) {
    self.pending_llm_image = Some(path);
  }

  pub fn take_pending_llm_image(&mut self) -> Option<String> {
    self.pending_llm_image.take()
  }

  /// 记录本次截图，并返回上一次的截图路径（供调用方删除旧文件）。
  pub fn replace_last_llm_image(&mut self, path: String) -> Option<String> {
    self.last_llm_image.replace(path)
  }

  pub fn set_is_clipping(&mut self, app: &AppHandle, is_clipping: bool) {
    self.is_clipping = is_clipping;

    if is_clipping {
      setup_mask(app.clone()).unwrap();

      match app.get_webview_window("clip") {
        Some(window) => {
          app.emit("window-will-show", ()).unwrap();

          window.show().unwrap();
          window.set_focus().unwrap();
        }
        None => eprintln!("get window by label \"clip\" failed"),
      }
    } else {
      app.emit("window-will-hide", ()).unwrap();

      app.get_webview_window("clip").unwrap().hide().unwrap();
    }
  }
}
