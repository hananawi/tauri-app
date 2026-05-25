use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
  AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
};

use crate::state::AppState;

const LLM_RESULT_PREFIX: &str = "llm-result-";
const LLM_RESULT_WIDTH: f64 = 480.0;
const LLM_RESULT_HEIGHT: f64 = 600.0;

pub fn show_window(app: &AppHandle, label: &str) -> Result<(), String> {
  let window = app
    .get_webview_window(label)
    .ok_or_else(|| format!("找不到窗口：{label}"))?;
  window.show().map_err(|e| e.to_string())?;
  window.set_focus().map_err(|e| e.to_string())?;
  Ok(())
}

/// 为本次截图新建一个独立的识别结果窗口。
///
/// 每次截图都创建一个带唯一 label 的窗口（`llm-result-{时间戳}`），互不复用，
/// 这样在等待某个窗口的接口返回时，可以再次截图触发新的请求并保留旧窗口。
/// 截图路径按 label 暂存到 `AppState`，由窗口内的页面取走后发起请求。
#[tauri::command]
pub fn open_llm_result_window(
  image_path: String,
  app: AppHandle,
  state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
  let ts = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map_err(|e| e.to_string())?
    .as_millis();

  // 已存在的结果窗口数：用于层叠偏移，避免新窗口完全盖住旧窗口。
  let existing = app
    .webview_windows()
    .keys()
    .filter(|l| l.starts_with(LLM_RESULT_PREFIX))
    .count();

  // 时间戳 + 序号双重保证 label 唯一（同一毫秒内连续触发也不冲突）。
  let label = format!("{LLM_RESULT_PREFIX}{ts}-{existing}");

  state
    .lock()
    .map_err(|e| e.to_string())?
    .set_pending_llm_image(label.clone(), image_path);

  // 以鼠标所在屏（用户当前操作的屏）中心为基准，按已有窗口数做层叠偏移。
  let (base_x, base_y) = active_monitor_center(&app);
  let offset = (existing % 6) as f64 * 32.0;

  // 基础参数：跨平台通用
  let mut builder =
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("/llm-result".into()))
      .title("识别结果")
      .inner_size(LLM_RESULT_WIDTH, LLM_RESULT_HEIGHT)
      .position(base_x + offset, base_y + offset)
      .resizable(true)
      .always_on_top(true)
      .shadow(true);

  // macOS：标题栏改 Overlay（交通灯悬浮、标题文字隐藏，内容延伸到标题栏下方），
  // 并让窗口背景透明，把外观交给下面的原生毛玻璃层。
  #[cfg(target_os = "macos")]
  {
    builder = builder
      .title_bar_style(tauri::TitleBarStyle::Overlay)
      .hidden_title(true)
      .transparent(true);
  }
  // Windows / 其它平台：去掉系统装饰，标题栏由前端自绘。
  //
  // 不开 transparent + 不套 Acrylic：在部分 Win10/Win11 上 Acrylic + WebView2
  // transparent 会导致整个窗口完全透明、内容看不见（用户感知为「空白窗口」），
  // 且失败时静默退化没有兜底背景。为稳妥起见，Windows 上保持普通不透明窗口，
  // 美感交给前端 CSS。
  #[cfg(not(target_os = "macos"))]
  {
    builder = builder.decorations(false);
  }

  let window = builder.build().map_err(|e| e.to_string())?;

  // 套上各平台的原生半透明材质（仅 macOS，Windows 见上文注释）。
  apply_window_vibrancy(&window);

  Ok(())
}

/// 鼠标所在屏（用户当前操作的屏）逻辑坐标系下，使结果窗口居中的左上角坐标。
/// 取不到任何显示器时退回固定值。
fn active_monitor_center(app: &AppHandle) -> (f64, f64) {
  if let Some(monitor) = active_monitor(app) {
    let sf = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(sf);
    let pos = monitor.position().to_logical::<f64>(sf);
    let x = pos.x + (size.width - LLM_RESULT_WIDTH) / 2.0;
    let y = pos.y + (size.height - LLM_RESULT_HEIGHT) / 2.0;
    return (x.max(0.0), y.max(0.0));
  }
  (200.0, 200.0)
}

/// 找鼠标所在屏（即用户当前操作的屏）；找不到就退回主屏。
/// 与 `ocr.rs` 里截图选屏的口径一致：坐标用物理像素比较。
fn active_monitor(app: &AppHandle) -> Option<tauri::Monitor> {
  if let (Ok(cursor), Ok(monitors)) =
    (app.cursor_position(), app.available_monitors())
  {
    let hit = monitors.iter().find(|m| {
      let pos = m.position();
      let size = m.size();
      cursor.x >= pos.x as f64
        && cursor.x < pos.x as f64 + size.width as f64
        && cursor.y >= pos.y as f64
        && cursor.y < pos.y as f64 + size.height as f64
    });
    if let Some(m) = hit {
      return Some(m.clone());
    }
  }
  app.primary_monitor().ok().flatten()
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
  show_window(&app, "settings")
}

/// 给结果窗口套上原生半透明材质：macOS 用 NSVisualEffectView 毛玻璃。
/// Windows 上不套 Acrylic，原因见 `open_llm_result_window` 内的注释。
#[allow(unused_variables)]
fn apply_window_vibrancy(window: &tauri::WebviewWindow) {
  #[cfg(target_os = "macos")]
  {
    use window_vibrancy::{NSVisualEffectMaterial, NSVisualEffectState};
    // HudWindow：磨砂感最强、最通透的材质。第四个参数为圆角半径，
    // 与前端 `rounded-xl` 的 12px 对齐。
    let _ = window_vibrancy::apply_vibrancy(
      window,
      NSVisualEffectMaterial::HudWindow,
      Some(NSVisualEffectState::Active),
      Some(12.0),
    );
  }
}
