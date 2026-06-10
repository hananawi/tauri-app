// 桌面端设置适配层：用 tauriStore 实例化共享的 createSettings，
// 再以与旧 API 完全一致的命名导出供各页面使用（避免改动 SettingsPage / ClipPage）。
// 平台兼容逻辑（Windows 强制走 llm / 禁用 cli）保留在这一层。
import {
  createSettings,
  DEFAULT_PROVIDER,
  type LlmProvider,
  type RecognitionMode,
} from "@tachibana/shared";
import { IS_WINDOWS } from "./platform";
import { tauriStore } from "./settings/tauriStore";

export { DEFAULT_CLIP_SHORTCUT } from "@tachibana/shared";
export type { LlmProvider, RecognitionMode } from "@tachibana/shared";

const settings = createSettings(tauriStore);

// Windows 无本地 OCR（Vision 是 macOS 框架），强制走 LLM —— 即使存储里
// 残留 "ocr"（旧配置或导入而来）也忽略，避免截图后走识别空跑、蒙层卡死。
export async function getRecognitionMode(): Promise<RecognitionMode> {
  if (IS_WINDOWS) return "llm";
  return settings.getRecognitionMode();
}
export const setRecognitionMode = settings.setRecognitionMode;

// Windows 无法定位 npm 装的 claude.cmd（Command 只认 .exe），本地 CLI
// 走不通，残留 "cli" 配置一律回退到默认 provider。
export async function getLlmProvider(): Promise<LlmProvider> {
  const provider = await settings.getLlmProvider();
  if (provider === "cli" && IS_WINDOWS) return DEFAULT_PROVIDER;
  return provider;
}
export const setLlmProvider = settings.setLlmProvider;

export const getClaudeCliPath = settings.getClaudeCliPath;
export const setClaudeCliPath = settings.setClaudeCliPath;
export const getSessionDir = settings.getSessionDir;
export const setSessionDir = settings.setSessionDir;
export const getAnthropicBaseUrl = settings.getAnthropicBaseUrl;
export const setAnthropicBaseUrl = settings.setAnthropicBaseUrl;
export const getAnthropicAuthToken = settings.getAnthropicAuthToken;
export const setAnthropicAuthToken = settings.setAnthropicAuthToken;
export const getOpenaiBaseUrl = settings.getOpenaiBaseUrl;
export const setOpenaiBaseUrl = settings.setOpenaiBaseUrl;
export const getOpenaiApiKey = settings.getOpenaiApiKey;
export const setOpenaiApiKey = settings.setOpenaiApiKey;
export const getOpenaiModel = settings.getOpenaiModel;
export const setOpenaiModel = settings.setOpenaiModel;
export const getCloudflareBaseUrl = settings.getCloudflareBaseUrl;
export const setCloudflareBaseUrl = settings.setCloudflareBaseUrl;
export const getCloudflareAigAuthorization = settings.getCloudflareAigAuthorization;
export const setCloudflareAigAuthorization = settings.setCloudflareAigAuthorization;
export const getCloudflareAigByokAlias = settings.getCloudflareAigByokAlias;
export const setCloudflareAigByokAlias = settings.setCloudflareAigByokAlias;
export const getCloudflareModel = settings.getCloudflareModel;
export const setCloudflareModel = settings.setCloudflareModel;
export const getProxyUrl = settings.getProxyUrl;
export const setProxyUrl = settings.setProxyUrl;
export const getClipShortcut = settings.getClipShortcut;
export const setClipShortcut = settings.setClipShortcut;
export const getPresetPrompt = settings.getPresetPrompt;
export const setPresetPrompt = settings.setPresetPrompt;
export const exportSettings = settings.exportSettings;
export const importSettings = settings.importSettings;
