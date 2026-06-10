// 设置项的 key 常量、默认值与类型，移植自 src/lib/settings.ts。
// 纯数据，无平台依赖；平台相关的兼容逻辑（如 Windows 强制走 llm / 禁用 cli）
// 留在桌面适配层。

export type RecognitionMode = "ocr" | "llm";
export type LlmProvider = "api" | "cli" | "openai" | "cloudflare";

export const RECOGNITION_MODE_KEY = "recognitionMode";
export const LLM_PROVIDER_KEY = "llmProvider";
export const ANTHROPIC_BASE_URL_KEY = "anthropicBaseUrl";
export const ANTHROPIC_AUTH_TOKEN_KEY = "anthropicAuthToken";
export const CLAUDE_CLI_PATH_KEY = "claudeCliPath";
export const SESSION_DIR_KEY = "sessionDir";
export const PRESET_PROMPT_KEY = "presetPrompt";
// 旧 dashscope 字段，仅在用户尚未配置 openai 时作为兜底读取，不再写入。
export const LEGACY_DASHSCOPE_BASE_URL_KEY = "dashscopeBaseUrl";
export const LEGACY_DASHSCOPE_API_KEY_KEY = "dashscopeApiKey";
export const LEGACY_DASHSCOPE_MODEL_KEY = "dashscopeModel";
export const OPENAI_BASE_URL_KEY = "openaiBaseUrl";
export const OPENAI_API_KEY_KEY = "openaiApiKey";
export const OPENAI_MODEL_KEY = "openaiModel";
export const CLIP_SHORTCUT_KEY = "clipShortcut";
export const CF_BASE_URL_KEY = "cloudflareBaseUrl";
export const CF_AUTH_KEY = "cloudflareAigAuthorization";
export const CF_BYOK_ALIAS_KEY = "cloudflareAigByokAlias";
export const CF_MODEL_KEY = "cloudflareModel";
export const PROXY_URL_KEY = "proxyUrl";

export const DEFAULT_MODE: RecognitionMode = "llm";
export const DEFAULT_PROVIDER: LlmProvider = "api";
export const DEFAULT_BASE_URL = "https://idealab.alibaba-inc.com/api/anthropic";
export const DEFAULT_CLI_PATH = "claude";
export const DEFAULT_SESSION_DIR = "tachibana-capture";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_CF_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/fde103cecbb135298d9110a4ef8c8ed6/hananawi";
export const DEFAULT_CF_MODEL = "anthropic/claude-3-5-sonnet-20241022";
// 默认留空＝直连；填了才对所有 HTTP provider 生效，cli 走子进程不受影响。
export const DEFAULT_PROXY_URL = "";
export const DEFAULT_CLIP_SHORTCUT = "CommandOrControl+Shift+KeyR";

// 允许导入/导出的所有键（含旧 dashscope 字段，便于跨版本迁移）。
export const EXPORT_KEYS = [
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
  PROXY_URL_KEY,
] as const;
