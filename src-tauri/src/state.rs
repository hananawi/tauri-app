use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::Shortcut;

use crate::ocr::show_clip;

pub struct AppState {
  pub is_clipping: bool,
  /// 当前截图会话的冻屏整图 PNG。截图开始时抓好存入，结束时清空。
  /// 由 `clipimg` 自定义协议读取喂给前端当底图，命令层按选区裁剪它。
  pub frozen_capture: Option<Vec<u8>>,
  pub pending_llm_image: Option<String>,
  pub last_llm_image: Option<String>,
  pub current_clip_shortcut: Option<Shortcut>,
}

impl AppState {
  pub fn new() -> Self {
    Self {
      is_clipping: false,
      frozen_capture: None,
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

  /// 克隆当前冻屏整图，供命令层裁剪。没有则返回错误。
  pub fn clone_frozen_capture(&self) -> Result<Vec<u8>, String> {
    self
      .frozen_capture
      .clone()
      .ok_or_else(|| "没有可用的截图，请重新触发截图".to_string())
  }

  pub fn set_is_clipping(&mut self, app: &AppHandle, is_clipping: bool) {
    self.is_clipping = is_clipping;

    if is_clipping {
      // 抓屏放后台线程：ScreenCaptureKit 回调依赖主 run loop 继续转，主线程
      // 阻塞等回调会死锁。窗口操作所需的主线程切换由 show_clip 内部处理。
      let app = app.clone();
      std::thread::spawn(move || {
        if let Err(err) = show_clip(&app) {
          eprintln!("启动截图失败：{err}");
          // 抓屏失败则回滚状态，否则快捷键会因为 is_clipping 卡死。
          if let Some(state) = app.try_state::<Mutex<AppState>>() {
            if let Ok(mut guard) = state.lock() {
              guard.is_clipping = false;
            }
          }
        }
      });
    } else {
      // 截图会话结束，释放冻屏整图占用的内存。
      self.frozen_capture = None;
      let _ = app.emit("window-will-hide", ());
      if let Some(window) = app.get_webview_window("clip") {
        let _ = window.hide();
      }
    }
  }
}
