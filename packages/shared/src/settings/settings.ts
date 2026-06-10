// 类型化设置读写，移植自 src/lib/settings.ts，参数化为任意 SettingsStore。
// 纯逻辑（含旧 dashscope 字段兜底、导入/导出），不含平台兼容（Windows 强制走
// llm / 禁用 cli 的逻辑留在桌面适配层，见 apps/desktop/src/lib/settings.ts）。
import {
  ANTHROPIC_AUTH_TOKEN_KEY,
  ANTHROPIC_BASE_URL_KEY,
  CF_AUTH_KEY,
  CF_BASE_URL_KEY,
  CF_BYOK_ALIAS_KEY,
  CF_MODEL_KEY,
  CLAUDE_CLI_PATH_KEY,
  CLIP_SHORTCUT_KEY,
  DEFAULT_BASE_URL,
  DEFAULT_CF_BASE_URL,
  DEFAULT_CF_MODEL,
  DEFAULT_CLI_PATH,
  DEFAULT_CLIP_SHORTCUT,
  DEFAULT_MODE,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  DEFAULT_PROXY_URL,
  DEFAULT_SESSION_DIR,
  EXPORT_KEYS,
  LEGACY_DASHSCOPE_API_KEY_KEY,
  LEGACY_DASHSCOPE_BASE_URL_KEY,
  LEGACY_DASHSCOPE_MODEL_KEY,
  LLM_PROVIDER_KEY,
  OPENAI_API_KEY_KEY,
  OPENAI_BASE_URL_KEY,
  OPENAI_MODEL_KEY,
  PRESET_PROMPT_KEY,
  PROXY_URL_KEY,
  RECOGNITION_MODE_KEY,
  SESSION_DIR_KEY,
  type LlmProvider,
  type RecognitionMode,
} from "./keys";
import { DEFAULT_PRESET_PROMPT } from "../prompt";
import type { SettingsStore } from "./store";

export interface CreateSettingsOptions {
  /** 覆盖 presetPrompt 默认值（插件端用网页文字版默认 prompt）。 */
  defaultPresetPrompt?: string;
}

/**
 * 用给定的 store 构造一组类型化 getter/setter。所有 setter 写入后调用
 * store.set；桌面端的 LazyStore 在适配层负责 save 落盘，插件端 chrome.storage
 * 写入即落盘。
 */
export function createSettings(
  store: SettingsStore,
  options: CreateSettingsOptions = {}
) {
  const defaultPresetPrompt =
    options.defaultPresetPrompt ?? DEFAULT_PRESET_PROMPT;

  return {
    async getRecognitionMode(): Promise<RecognitionMode> {
      const mode = await store.get<RecognitionMode>(RECOGNITION_MODE_KEY);
      return mode ?? DEFAULT_MODE;
    },
    async setRecognitionMode(mode: RecognitionMode): Promise<void> {
      await store.set(RECOGNITION_MODE_KEY, mode);
    },

    /** 校验后的 provider（含 dashscope→openai 迁移）；不含平台兼容。 */
    async getLlmProvider(): Promise<LlmProvider> {
      const provider = await store.get<string>(LLM_PROVIDER_KEY);
      if (provider === "dashscope") return "openai";
      if (
        provider === "api" ||
        provider === "cli" ||
        provider === "openai" ||
        provider === "cloudflare"
      ) {
        return provider;
      }
      return DEFAULT_PROVIDER;
    },
    async setLlmProvider(provider: LlmProvider): Promise<void> {
      await store.set(LLM_PROVIDER_KEY, provider);
    },

    async getClaudeCliPath(): Promise<string> {
      return (await store.get<string>(CLAUDE_CLI_PATH_KEY)) ?? DEFAULT_CLI_PATH;
    },
    async setClaudeCliPath(path: string): Promise<void> {
      await store.set(CLAUDE_CLI_PATH_KEY, path);
    },

    async getSessionDir(): Promise<string> {
      return (await store.get<string>(SESSION_DIR_KEY)) ?? DEFAULT_SESSION_DIR;
    },
    async setSessionDir(dir: string): Promise<void> {
      await store.set(SESSION_DIR_KEY, dir);
    },

    async getAnthropicBaseUrl(): Promise<string> {
      return (await store.get<string>(ANTHROPIC_BASE_URL_KEY)) ?? DEFAULT_BASE_URL;
    },
    async setAnthropicBaseUrl(url: string): Promise<void> {
      await store.set(ANTHROPIC_BASE_URL_KEY, url);
    },

    async getAnthropicAuthToken(): Promise<string> {
      return (await store.get<string>(ANTHROPIC_AUTH_TOKEN_KEY)) ?? "";
    },
    async setAnthropicAuthToken(token: string): Promise<void> {
      await store.set(ANTHROPIC_AUTH_TOKEN_KEY, token);
    },

    async getOpenaiBaseUrl(): Promise<string> {
      const url = await store.get<string>(OPENAI_BASE_URL_KEY);
      if (url) return url;
      const legacy = await store.get<string>(LEGACY_DASHSCOPE_BASE_URL_KEY);
      return legacy ?? DEFAULT_OPENAI_BASE_URL;
    },
    async setOpenaiBaseUrl(url: string): Promise<void> {
      await store.set(OPENAI_BASE_URL_KEY, url);
    },

    async getOpenaiApiKey(): Promise<string> {
      const key = await store.get<string>(OPENAI_API_KEY_KEY);
      if (key) return key;
      const legacy = await store.get<string>(LEGACY_DASHSCOPE_API_KEY_KEY);
      return legacy ?? "";
    },
    async setOpenaiApiKey(key: string): Promise<void> {
      await store.set(OPENAI_API_KEY_KEY, key);
    },

    async getOpenaiModel(): Promise<string> {
      const model = await store.get<string>(OPENAI_MODEL_KEY);
      if (model) return model;
      const legacy = await store.get<string>(LEGACY_DASHSCOPE_MODEL_KEY);
      return legacy ?? DEFAULT_OPENAI_MODEL;
    },
    async setOpenaiModel(model: string): Promise<void> {
      await store.set(OPENAI_MODEL_KEY, model);
    },

    async getCloudflareBaseUrl(): Promise<string> {
      return (await store.get<string>(CF_BASE_URL_KEY)) ?? DEFAULT_CF_BASE_URL;
    },
    async setCloudflareBaseUrl(url: string): Promise<void> {
      await store.set(CF_BASE_URL_KEY, url);
    },

    async getCloudflareAigAuthorization(): Promise<string> {
      return (await store.get<string>(CF_AUTH_KEY)) ?? "";
    },
    async setCloudflareAigAuthorization(token: string): Promise<void> {
      await store.set(CF_AUTH_KEY, token);
    },

    async getCloudflareAigByokAlias(): Promise<string> {
      return (await store.get<string>(CF_BYOK_ALIAS_KEY)) ?? "";
    },
    async setCloudflareAigByokAlias(alias: string): Promise<void> {
      await store.set(CF_BYOK_ALIAS_KEY, alias);
    },

    async getCloudflareModel(): Promise<string> {
      return (await store.get<string>(CF_MODEL_KEY)) ?? DEFAULT_CF_MODEL;
    },
    async setCloudflareModel(model: string): Promise<void> {
      await store.set(CF_MODEL_KEY, model);
    },

    async getProxyUrl(): Promise<string> {
      return (await store.get<string>(PROXY_URL_KEY)) ?? DEFAULT_PROXY_URL;
    },
    async setProxyUrl(url: string): Promise<void> {
      await store.set(PROXY_URL_KEY, url);
    },

    async getClipShortcut(): Promise<string> {
      return (await store.get<string>(CLIP_SHORTCUT_KEY)) ?? DEFAULT_CLIP_SHORTCUT;
    },
    async setClipShortcut(sc: string): Promise<void> {
      await store.set(CLIP_SHORTCUT_KEY, sc);
    },

    async getPresetPrompt(): Promise<string> {
      return (await store.get<string>(PRESET_PROMPT_KEY)) ?? defaultPresetPrompt;
    },
    async setPresetPrompt(prompt: string): Promise<void> {
      await store.set(PRESET_PROMPT_KEY, prompt);
    },

    async exportSettings(): Promise<Record<string, unknown>> {
      const out: Record<string, unknown> = {};
      for (const key of EXPORT_KEYS) {
        const value = await store.get(key);
        if (value !== undefined) out[key] = value;
      }
      return out;
    },

    async importSettings(
      data: unknown
    ): Promise<{ applied: string[]; skipped: string[] }> {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("配置文件格式错误：根节点必须是 JSON 对象");
      }
      const exportKeySet = new Set<string>(EXPORT_KEYS);
      const obj = data as Record<string, unknown>;
      const applied: string[] = [];
      const skipped: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        if (!exportKeySet.has(key)) {
          skipped.push(key);
          continue;
        }
        await store.set(key, value);
        applied.push(key);
      }
      return { applied, skipped };
    },
  };
}

export type Settings = ReturnType<typeof createSettings>;
