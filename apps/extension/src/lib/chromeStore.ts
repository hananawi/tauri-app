// SettingsStore 适配：插件端用 chrome.storage.local（写入即落盘）。
import type { SettingsStore } from "@tachibana/shared/settings/store";

// 扩展被重载/更新后，旧页面里残留的 content script 会失去运行时上下文，此时
// chrome.storage 变为 undefined，读 .local 会抛 "Cannot read properties of
// undefined (reading 'local')"。提前拦下，给出能看懂的提示（同 portTransport）。
function storageArea(): chrome.storage.LocalStorageArea {
  const area = chrome.storage?.local;
  if (!area) throw new Error("插件已更新，请刷新本页面后重试");
  return area;
}

export const chromeStore: SettingsStore = {
  async get<T>(key: string): Promise<T | undefined> {
    const res = await storageArea().get(key);
    return res[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await storageArea().set({ [key]: value });
  },
};
