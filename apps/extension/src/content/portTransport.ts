// LlmTransport 适配（插件 panel 侧）：经 Port 把流式请求代理到 Service Worker，
// 真正的 fetch 在 SW 里跑（见 background/index.ts）。abort = 断开 Port，
// SW 侧 onDisconnect 会 AbortController.abort() 取消 fetch。
import type {
  LlmAskParams,
  LlmStreamHandlers,
  LlmStreamHandle,
  LlmTransport,
} from "@tachibana/shared";

// 扩展被重载/更新后，旧页面里残留的 content script 会失去运行时上下文
// （chrome.runtime.id 变为 undefined），此后任何 connect/postMessage 都会抛
// "Extension context invalidated"。这种情况无法自愈，只能提示用户刷新页面。
const RELOAD_HINT = "插件已更新，请刷新本页面后重试";
const contextAlive = () => Boolean(chrome.runtime?.id);

export const portTransport: LlmTransport = {
  ask(
    { messages, context, settings }: LlmAskParams,
    handlers: LlmStreamHandlers
  ): LlmStreamHandle {
    let settled = false;
    const noop: LlmStreamHandle = { abort: () => {} };

    if (!contextAlive()) {
      handlers.onError(RELOAD_HINT);
      return noop;
    }

    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: "llm-stream" });
    } catch {
      handlers.onError(RELOAD_HINT);
      return noop;
    }

    port.onMessage.addListener((msg) => {
      switch (msg?.type) {
        case "chunk":
          handlers.onChunk(msg.text);
          break;
        case "done":
          settled = true;
          handlers.onDone();
          break;
        case "error":
          settled = true;
          handlers.onError(msg.message);
          break;
        // "ping" 仅为 keepalive，忽略。
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      // 上下文已失效（扩展重载）与 SW 被回收/崩溃是两种不同处置：前者要刷新页面，
      // 后者重试即可。
      handlers.onError(contextAlive() ? "与后台连接断开，请重试" : RELOAD_HINT);
    });

    try {
      port.postMessage({ type: "start", messages, context, settings });
    } catch {
      settled = true;
      handlers.onError(RELOAD_HINT);
      return noop;
    }

    return {
      abort: () => {
        settled = true;
        try {
          port.disconnect();
        } catch {
          // 已断开，忽略。
        }
      },
    };
  },
};
