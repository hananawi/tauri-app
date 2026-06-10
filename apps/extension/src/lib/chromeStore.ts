// SettingsStore 适配：插件端用 chrome.storage.local（写入即落盘）。
import type { SettingsStore } from "@tachibana/shared/settings/store";

export const chromeStore: SettingsStore = {
  async get<T>(key: string): Promise<T | undefined> {
    const res = await chrome.storage.local.get(key);
    return res[key] as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
};
