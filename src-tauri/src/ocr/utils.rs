use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSScreen};
use objc2_core_foundation::CGRect;
use objc2_foundation::{NSArray, NSString};
use tauri::{LogicalPosition, LogicalSize, Manager};

use crate::ocr::OcrOptions;

pub struct Objc2Options {
  pub target_languages: Retained<NSArray<NSString>>,
}

pub fn convert_options(options: OcrOptions) -> Objc2Options {
  let target_languages: Retained<NSArray<NSString>> = options
    .target_languages
    .into_iter()
    .map(|s| NSString::from_str(&s))
    .collect();

  Objc2Options { target_languages }
}

pub fn setup_mask(app: tauri::AppHandle) -> Result<(), String> {
  if MainThreadMarker::new().is_some() {
    return setup_mask_on_main(&app);
  }

  let (tx, rx) = std::sync::mpsc::channel();
  let app_clone = app.clone();
  app
    .run_on_main_thread(move || {
      let _ = tx.send(setup_mask_on_main(&app_clone));
    })
    .map_err(|e| e.to_string())?;
  rx.recv().map_err(|e| e.to_string())?
}

fn setup_mask_on_main(app: &tauri::AppHandle) -> Result<(), String> {
  let window = app
    .get_webview_window("clip")
    .ok_or("clip window not found")?;

  let mtm = MainThreadMarker::new()
    .ok_or("setup_mask_on_main must be called on the main thread")?;
  let mouse_loc = NSEvent::mouseLocation();
  let screens = NSScreen::screens(mtm);

  // Primary screen is always first; its height is needed for coordinate conversion
  let primary_height = screens
    .iter()
    .next()
    .map(|s| s.frame().size.height)
    .unwrap_or(0.0);

  // Find the screen that contains the cursor
  let target_frame: CGRect = screens
    .iter()
    .find_map(|screen| {
      let frame = screen.frame();
      if mouse_loc.x >= frame.origin.x
        && mouse_loc.x < frame.origin.x + frame.size.width
        && mouse_loc.y >= frame.origin.y
        && mouse_loc.y < frame.origin.y + frame.size.height
      {
        Some(frame)
      } else {
        None
      }
    })
    .unwrap_or_else(|| screens.iter().next().unwrap().frame());

  // NSScreen frame is in Cocoa coordinates (bottom-left origin).
  // Convert to top-left origin for Tauri's LogicalPosition.
  let x = target_frame.origin.x;
  let y = primary_height - (target_frame.origin.y + target_frame.size.height);

  window
    .set_size(LogicalSize::new(
      target_frame.size.width,
      target_frame.size.height,
    ))
    .map_err(|e| e.to_string())?;
  window
    .set_position(LogicalPosition::new(x, y))
    .map_err(|e| e.to_string())?;
  window.set_always_on_top(true).map_err(|e| e.to_string())?;

  Ok(())
}
