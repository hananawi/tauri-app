// 运行平台判断。navigator.platform 虽已废弃，但在 WebView 里仍稳定可用，
// 且本项目不额外引入 @tauri-apps/plugin-os，沿用既有的轻量判断方式。
const platform =
  typeof navigator !== "undefined" ? navigator.platform : "";

export const IS_MAC = /Mac|iPhone|iPad/i.test(platform);
export const IS_WINDOWS = /Win/i.test(platform);
