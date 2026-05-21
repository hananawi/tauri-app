import { LazyStore } from "@tauri-apps/plugin-store";
import { IS_WINDOWS } from "./platform";
import { DEFAULT_PRESET_PROMPT } from "./prompt";

export type RecognitionMode = "ocr" | "llm";
export type LlmProvider = "api" | "cli" | "openai" | "cloudflare";

const RECOGNITION_MODE_KEY = "recognitionMode";
const LLM_PROVIDER_KEY = "llmProvider";
const ANTHROPIC_BASE_URL_KEY = "anthropicBaseUrl";
const ANTHROPIC_AUTH_TOKEN_KEY = "anthropicAuthToken";
const CLAUDE_CLI_PATH_KEY = "claudeCliPath";
const SESSION_DIR_KEY = "sessionDir";
const PRESET_PROMPT_KEY = "presetPrompt";
// 旧 dashscope 字段，仅在用户尚未配置 openai 时作为兜底读取，不再写入。
const LEGACY_DASHSCOPE_BASE_URL_KEY = "dashscopeBaseUrl";
const LEGACY_DASHSCOPE_API_KEY_KEY = "dashscopeApiKey";
const LEGACY_DASHSCOPE_MODEL_KEY = "dashscopeModel";
const OPENAI_BASE_URL_KEY = "openaiBaseUrl";
const OPENAI_API_KEY_KEY = "openaiApiKey";
const OPENAI_MODEL_KEY = "openaiModel";
const CLIP_SHORTCUT_KEY = "clipShortcut";
const CF_BASE_URL_KEY = "cloudflareBaseUrl";
const CF_AUTH_KEY = "cloudflareAigAuthorization";
const CF_BYOK_ALIAS_KEY = "cloudflareAigByokAlias";
const CF_MODEL_KEY = "cloudflareModel";

const DEFAULT_MODE: RecognitionMode = "llm";
const DEFAULT_PROVIDER: LlmProvider = "api";
const DEFAULT_BASE_URL = "https://idealab.alibaba-inc.com/api/anthropic";
const DEFAULT_CLI_PATH = "claude";
const DEFAULT_SESSION_DIR = "tachibana-capture";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CF_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/fde103cecbb135298d9110a4ef8c8ed6/hananawi";
const DEFAULT_CF_MODEL = "anthropic/claude-3-5-sonnet-20241022";
export const DEFAULT_CLIP_SHORTCUT = "CommandOrControl+Shift+KeyR";

const store = new LazyStore("settings.json");

export async function getRecognitionMode(): Promise<RecognitionMode> {
  // Windows 无本地 OCR（Vision 是 macOS 框架），强制走 LLM —— 即使存储里
  // 残留 "ocr"（旧配置或导入而来）也忽略，避免截图后走识别空跑、蒙层卡死。
  if (IS_WINDOWS) return "llm";
  const mode = await store.get<RecognitionMode>(RECOGNITION_MODE_KEY);
  return mode ?? DEFAULT_MODE;
}

export async function setRecognitionMode(
  mode: RecognitionMode
): Promise<void> {
  await store.set(RECOGNITION_MODE_KEY, mode);
  await store.save();
}

export async function getLlmProvider(): Promise<LlmProvider> {
  const provider = await store.get<string>(LLM_PROVIDER_KEY);
  // 老配置里的 "dashscope" 已合并到 "openai"（同一份 OpenAI 兼容协议）。
  if (provider === "dashscope") return "openai";
  if (
    provider === "api" ||
    provider === "cli" ||
    provider === "openai" ||
    provider === "cloudflare"
  ) {
    // Windows 无法定位 npm 装的 claude.cmd（Command 只认 .exe），本地 CLI
    // 走不通，残留 "cli" 配置一律回退到默认 provider。
    if (provider === "cli" && IS_WINDOWS) return DEFAULT_PROVIDER;
    return provider;
  }
  return DEFAULT_PROVIDER;
}

export async function setLlmProvider(provider: LlmProvider): Promise<void> {
  await store.set(LLM_PROVIDER_KEY, provider);
  await store.save();
}

export async function getClaudeCliPath(): Promise<string> {
  const path = await store.get<string>(CLAUDE_CLI_PATH_KEY);
  return path ?? DEFAULT_CLI_PATH;
}

export async function setClaudeCliPath(path: string): Promise<void> {
  await store.set(CLAUDE_CLI_PATH_KEY, path);
  await store.save();
}

export async function getSessionDir(): Promise<string> {
  const dir = await store.get<string>(SESSION_DIR_KEY);
  return dir ?? DEFAULT_SESSION_DIR;
}

export async function setSessionDir(dir: string): Promise<void> {
  await store.set(SESSION_DIR_KEY, dir);
  await store.save();
}

export async function getAnthropicBaseUrl(): Promise<string> {
  const url = await store.get<string>(ANTHROPIC_BASE_URL_KEY);
  return url ?? DEFAULT_BASE_URL;
}

export async function setAnthropicBaseUrl(url: string): Promise<void> {
  await store.set(ANTHROPIC_BASE_URL_KEY, url);
  await store.save();
}

export async function getAnthropicAuthToken(): Promise<string> {
  const token = await store.get<string>(ANTHROPIC_AUTH_TOKEN_KEY);
  return token ?? "";
}

export async function setAnthropicAuthToken(token: string): Promise<void> {
  await store.set(ANTHROPIC_AUTH_TOKEN_KEY, token);
  await store.save();
}

export async function getOpenaiBaseUrl(): Promise<string> {
  const url = await store.get<string>(OPENAI_BASE_URL_KEY);
  if (url) return url;
  const legacy = await store.get<string>(LEGACY_DASHSCOPE_BASE_URL_KEY);
  return legacy ?? DEFAULT_OPENAI_BASE_URL;
}

export async function setOpenaiBaseUrl(url: string): Promise<void> {
  await store.set(OPENAI_BASE_URL_KEY, url);
  await store.save();
}

export async function getOpenaiApiKey(): Promise<string> {
  const key = await store.get<string>(OPENAI_API_KEY_KEY);
  if (key) return key;
  const legacy = await store.get<string>(LEGACY_DASHSCOPE_API_KEY_KEY);
  return legacy ?? "";
}

export async function setOpenaiApiKey(key: string): Promise<void> {
  await store.set(OPENAI_API_KEY_KEY, key);
  await store.save();
}

export async function getOpenaiModel(): Promise<string> {
  const model = await store.get<string>(OPENAI_MODEL_KEY);
  if (model) return model;
  const legacy = await store.get<string>(LEGACY_DASHSCOPE_MODEL_KEY);
  return legacy ?? DEFAULT_OPENAI_MODEL;
}

export async function setOpenaiModel(model: string): Promise<void> {
  await store.set(OPENAI_MODEL_KEY, model);
  await store.save();
}

export async function getCloudflareBaseUrl(): Promise<string> {
  const url = await store.get<string>(CF_BASE_URL_KEY);
  return url ?? DEFAULT_CF_BASE_URL;
}

export async function setCloudflareBaseUrl(url: string): Promise<void> {
  await store.set(CF_BASE_URL_KEY, url);
  await store.save();
}

export async function getCloudflareAigAuthorization(): Promise<string> {
  const token = await store.get<string>(CF_AUTH_KEY);
  return token ?? "";
}

export async function setCloudflareAigAuthorization(token: string): Promise<void> {
  await store.set(CF_AUTH_KEY, token);
  await store.save();
}

export async function getCloudflareAigByokAlias(): Promise<string> {
  const alias = await store.get<string>(CF_BYOK_ALIAS_KEY);
  return alias ?? "";
}

export async function setCloudflareAigByokAlias(alias: string): Promise<void> {
  await store.set(CF_BYOK_ALIAS_KEY, alias);
  await store.save();
}

export async function getCloudflareModel(): Promise<string> {
  const model = await store.get<string>(CF_MODEL_KEY);
  return model ?? DEFAULT_CF_MODEL;
}

export async function setCloudflareModel(model: string): Promise<void> {
  await store.set(CF_MODEL_KEY, model);
  await store.save();
}

export async function getClipShortcut(): Promise<string> {
  const sc = await store.get<string>(CLIP_SHORTCUT_KEY);
  return sc ?? DEFAULT_CLIP_SHORTCUT;
}

export async function setClipShortcut(sc: string): Promise<void> {
  await store.set(CLIP_SHORTCUT_KEY, sc);
  await store.save();
}

export async function getPresetPrompt(): Promise<string> {
  const prompt = await store.get<string>(PRESET_PROMPT_KEY);
  return prompt ?? DEFAULT_PRESET_PROMPT;
}

export async function setPresetPrompt(prompt: string): Promise<void> {
  await store.set(PRESET_PROMPT_KEY, prompt);
  await store.save();
}

// 允许导入/导出的所有键（含旧 dashscope 字段，便于跨版本迁移）。
const EXPORT_KEYS = [
  RECOGNITION_MODE_KEY,
  LLM_PROVIDER_KEY,
  ANTHROPIC_BASE_URL_KEY,
  ANTHROPIC_AUTH_TOKEN_KEY,
  CLAUDE_CLI_PATH_KEY,
  SESSION_DIR_KEY,
  PRESET_PROMPT_KEY,
  LEGACY_DASHSCOPE_BASE_URL_KEY,
  LEGACY_DASHSCOPE_API_KEY_KEY,
  LEGACY_DASHSCOPE_MODEL_KEY,
  OPENAI_BASE_URL_KEY,
  OPENAI_API_KEY_KEY,
  OPENAI_MODEL_KEY,
  CLIP_SHORTCUT_KEY,
  CF_BASE_URL_KEY,
  CF_AUTH_KEY,
  CF_BYOK_ALIAS_KEY,
  CF_MODEL_KEY,
] as const;

const EXPORT_KEY_SET = new Set<string>(EXPORT_KEYS);

export async function exportSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of EXPORT_KEYS) {
    const value = await store.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export async function importSettings(
  data: unknown
): Promise<{ applied: string[]; skipped: string[] }> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("配置文件格式错误：根节点必须是 JSON 对象");
  }
  const obj = data as Record<string, unknown>;
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (!EXPORT_KEY_SET.has(key)) {
      skipped.push(key);
      continue;
    }
    await store.set(key, value);
    applied.push(key);
  }
  await store.save();
  return { applied, skipped };
}
