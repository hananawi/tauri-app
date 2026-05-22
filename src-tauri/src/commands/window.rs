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

  // 以主屏中心为基准，按已有窗口数做层叠偏移。
  let (base_x, base_y) = primary_center(&app);
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
  // Windows / 其它平台：去掉系统装饰，标题栏由前端自绘；
  // 窗口透明，背景交给下面的亚克力材质层。
  #[cfg(not(target_os = "macos"))]
  {
    builder = builder.decorations(false).transparent(true);
  }

  let window = builder.build().map_err(|e| e.to_string())?;

  // 套上各平台的原生半透明材质（失败不致命，仅退化为前端的半透明背景）。
  apply_window_vibrancy(&window);

  Ok(())
}

/// 主屏逻辑坐标系下，使结果窗口居中的左上角坐标。取不到主屏时退回固定值。
fn primary_center(app: &AppHandle) -> (f64, f64) {
  if let Ok(Some(monitor)) = app.primary_monitor() {
    let sf = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(sf);
    let pos = monitor.position().to_logical::<f64>(sf);
    let x = pos.x + (size.width - LLM_RESULT_WIDTH) / 2.0;
    let y = pos.y + (size.height - LLM_RESULT_HEIGHT) / 2.0;
    return (x.max(0.0), y.max(0.0));
  }
  (200.0, 200.0)
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
  show_window(&app, "settings")
}

/// 给结果窗口套上原生半透明材质：macOS 用 NSVisualEffectView 毛玻璃，
/// Windows 用 Acrylic 亚克力模糊。失败时静默退化为前端的半透明白背景。
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
  #[cfg(target_os = "windows")]
  {
    // None：使用跟随系统主题的默认着色。
    let _ = window_vibrancy::apply_acrylic(window, None);
  }
}
