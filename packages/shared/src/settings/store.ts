// 存储抽象：把设置读写与具体后端解耦。
// - 桌面：包 @tauri-apps/plugin-store 的 LazyStore（见桌面适配层 tauriStore）。
// - 插件：包 chrome.storage.local（见插件 lib/chromeStore）。
export interface SettingsStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}
