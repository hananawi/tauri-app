// 浏览器端（MV3 Service Worker）的流式 LLM 客户端，用 fetch + ReadableStream
// 重新实现 src-tauri/src/commands/llm.rs 里 3 个 HTTP provider 的流式逻辑。
//
// 为什么在 SW 跑而非 content script：宿主页 CSP 的 connect-src 会拦请求、
// 自定义 header 触发 CORS 预检、user-agent 在内容脚本被静默剥离；SW 配合
// host_permissions 可绕过 CORS。cli provider 浏览器无法实现，直接报错。

import {
  ANTHROPIC_API_MODEL,
  anthropicHeaders,
  cloudflareHeaders,
  openaiHeaders,
} from "./headers";
import { buildAnthropicMessages, buildOpenaiMessages } from "./messages";
import { handleAnthropicSseBlock, handleOpenaiSseBlock } from "./sse";
import type {
  ChatMessage,
  LlmContext,
  LlmStreamHandlers,
  ProviderSettings,
} from "./types";

export interface FetchStreamParams {
  messages: ChatMessage[];
  context: LlmContext;
  settings: ProviderSettings;
  signal: AbortSignal;
}

type BlockParser = (block: string, handlers: LlmStreamHandlers) => void;

/**
 * 读取 SSE 响应流：按 "\n\n" 切分事件块逐块解析，结束后统一收尾。
 * Anthropic 的 onDone 由 message_stop 触发，这里再兜底 onDone 一次
 * （safe 包装保证只结算一次）。
 */
async function pumpStream(
  resp: Response,
  parse: BlockParser,
  handlers: LlmStreamHandlers
): Promise<void> {
  const reader = resp.body?.getReader();
  if (!reader) {
    handlers.onError("响应没有可读的流");
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx + 2);
      buffer = buffer.slice(idx + 2);
      parse(block, handlers);
    }
  }
  // 末尾可能残留一个不带空行结尾的事件块。
  if (buffer.trim()) parse(buffer, handlers);
  handlers.onDone();
}

async function streamAnthropic(
  { messages, context, settings, signal }: FetchStreamParams,
  handlers: LlmStreamHandlers
): Promise<void> {
  const { baseUrl, authToken } = settings;
  if (!authToken) return handlers.onError("未配置 Auth Token，请在设置中填写");
  if (!baseUrl) return handlers.onError("未配置 Base URL，请在设置中填写");

  const body = {
    model: ANTHROPIC_API_MODEL,
    max_tokens: 2048,
    stream: true,
    messages: buildAnthropicMessages(messages, context),
  };
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: anthropicHeaders(authToken),
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return handlers.onError(`API 返回错误 ${resp.status}：${text}`);
  }
  await pumpStream(resp, handleAnthropicSseBlock, handlers);
}

async function streamOpenaiCompat(
  { messages, context, settings, signal }: FetchStreamParams,
  handlers: LlmStreamHandlers
): Promise<void> {
  const { openaiBaseUrl, openaiApiKey, openaiModel } = settings;
  if (!openaiApiKey) return handlers.onError("未配置 API Key，请在设置中填写");
  if (!openaiBaseUrl) return handlers.onError("未配置 Base URL，请在设置中填写");
  if (!openaiModel) return handlers.onError("未配置模型名，请在设置中填写");

  const body = {
    model: openaiModel,
    stream: true,
    messages: buildOpenaiMessages(messages, context),
  };
  // 兼容用户在 base URL 里带或不带 /v1 后缀。
  const trimmed = openaiBaseUrl.replace(/\/+$/, "");
  const endpoint = trimmed.endsWith("/v1")
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: openaiHeaders(openaiApiKey),
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return handlers.onError(`API 返回错误 ${resp.status}：${text}`);
  }
  await pumpStream(resp, handleOpenaiSseBlock, handlers);
}

async function streamCloudflare(
  { messages, context, settings, signal }: FetchStreamParams,
  handlers: LlmStreamHandlers
): Promise<void> {
  const {
    cloudflareBaseUrl,
    cloudflareAigAuthorization,
    cloudflareAigByokAlias,
    cloudflareModel,
  } = settings;
  if (!cloudflareBaseUrl)
    return handlers.onError("未配置 Cloudflare Base URL，请在设置中填写");
  if (!cloudflareAigAuthorization)
    return handlers.onError("未配置 cf-aig-authorization，请在设置中填写");
  if (!cloudflareAigByokAlias)
    return handlers.onError("未配置 cf-aig-byok-alias，请在设置中填写");
  if (!cloudflareModel) return handlers.onError("未配置模型，请在设置中填写");

  const body = {
    model: cloudflareModel,
    stream: true,
    messages: buildOpenaiMessages(messages, context),
  };
  const endpoint = `${cloudflareBaseUrl.replace(/\/+$/, "")}/compat/chat/completions`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: cloudflareHeaders(
      cloudflareAigAuthorization,
      cloudflareAigByokAlias
    ),
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return handlers.onError(`API 返回错误 ${resp.status}：${text}`);
  }
  await pumpStream(resp, handleOpenaiSseBlock, handlers);
}

/**
 * 创建一个流式 LLM 客户端。`stream` 按 settings.provider 分发到对应实现，
 * 经 handlers 回传增量 / 结束 / 错误。回调用 safe 包装，保证整轮只结算一次。
 * 通过 params.signal（AbortController）取消请求；取消时静默返回，不触发 onError。
 */
export function createFetchLlmClient() {
  return {
    async stream(
      params: FetchStreamParams,
      handlers: LlmStreamHandlers
    ): Promise<void> {
      let settled = false;
      const safe: LlmStreamHandlers = {
        onChunk: (t) => {
          if (!settled) handlers.onChunk(t);
        },
        onDone: () => {
          if (settled) return;
          settled = true;
          handlers.onDone();
        },
        onError: (m) => {
          if (settled) return;
          settled = true;
          handlers.onError(m);
        },
      };

      if (params.context.kind === "image") {
        return safe.onError("浏览器插件暂不支持图片输入，仅支持网页选中文字");
      }

      try {
        switch (params.settings.provider) {
          case "cli":
            return safe.onError("浏览器插件不支持本地 Claude CLI provider");
          case "openai":
            return await streamOpenaiCompat(params, safe);
          case "cloudflare":
            return await streamCloudflare(params, safe);
          default:
            return await streamAnthropic(params, safe);
        }
      } catch (err) {
        // AbortController 取消 fetch / reader → 静默结束（消费方已断开）。
        if (params.signal.aborted || (err as Error)?.name === "AbortError") {
          return;
        }
        safe.onError(`请求失败：${String(err)}`);
      }
    },
  };
}

export type FetchLlmClient = ReturnType<typeof createFetchLlmClient>;
