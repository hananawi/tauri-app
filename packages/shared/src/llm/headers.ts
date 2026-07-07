// HTTP provider 的常量与 header 构造，移植自 src-tauri/src/commands/llm.rs。
//
// 桌面端走 Rust，会完整复刻 Claude Code CLI 的请求指纹（x-stainless-* /
// user-agent）以复用网关侧灰度/审计策略；插件端在 Service Worker 里用 fetch，
// 浏览器禁止脚本设置 user-agent 等受限 header，且网关灰度并非插件诉求，
// 故插件端只发让 API 工作所必需的 header（见 fetchClient.ts）。

/** Anthropic API provider 的模型在后端固定，没有前端配置项。 */
export const ANTHROPIC_API_MODEL = "claude-opus-4-7";

/** Anthropic Messages 接口的协议版本号。 */
export const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Claude Code CLI 的 anthropic-beta 特性集合。插件端默认不发（很多特性是
 * CLI 专属，普通网关用不到），保留常量供需要时按 base URL 选择性附加。
 */
export const CC_ANTHROPIC_BETA =
  "claude-code-20250219,oauth-2025-04-20,context-1m-2025-08-07,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05,advisor-tool-2026-03-01,effort-2025-11-24,afk-mode-2026-01-31,extended-cache-ttl-2025-04-11";

export const CC_USER_AGENT = "claude-cli/2.1.143 (external, sdk-cli)";

/**
 * Anthropic `/v1/messages` 请求 header（插件端最小可用集）。
 * anthropic-dangerous-direct-browser-access 让 Anthropic 官方端点放行浏览器直连；
 * 对自建网关无副作用。
 */
export function anthropicHeaders(authToken: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${authToken}`,
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/** OpenAI 兼容 `/v1/chat/completions` 请求 header。 */
export function openaiHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "text/event-stream",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

/** Cloudflare AI Gateway BYOK 请求 header。 */
export function cloudflareHeaders(
  aigAuth: string,
  byokAlias: string
): Record<string, string> {
  const aigAuthHeader = aigAuth.startsWith("Bearer ")
    ? aigAuth
    : `Bearer ${aigAuth}`;
  return {
    accept: "text/event-stream",
    "content-type": "application/json",
    "cf-aig-authorization": aigAuthHeader,
    "cf-aig-byok-alias": byokAlias,
    // AI Gateway 会把 anthropic-* header 透传给上游 Anthropic（官方文档示例中
    // anthropic-version 即被转发）。浏览器发起的请求带 Origin，Anthropic 会要求
    // 此 header 放行；补上后经网关透传即可通过。对非 Anthropic 上游是未知 header，
    // 被忽略、无副作用。
    "anthropic-dangerous-direct-browser-access": "true",
  };
}
