use tauri::{AppHandle, Emitter, Manager};

use crate::ocr::setup_mask;

pub struct AppState {
  pub is_clipping: bool,
}

impl AppState {
  pub fn new() -> Self {
    Self { is_clipping: false }
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
