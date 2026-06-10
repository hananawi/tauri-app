// SettingsStore 适配：桌面端用 @tauri-apps/plugin-store 的 LazyStore 落盘。
// LazyStore 需显式 save()，故每次 set 后立即 save，保持与旧实现「写入即落盘」一致。
import { LazyStore } from "@tauri-apps/plugin-store";
import type { SettingsStore } from "@tachibana/shared";

const lazy = new LazyStore("settings.json");

export const tauriStore: SettingsStore = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await lazy.get<T>(key)) ?? undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await lazy.set(key, value);
    await lazy.save();
  },
};
