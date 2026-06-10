// LlmTransport 适配（插件 panel 侧）：经 Port 把流式请求代理到 Service Worker，
// 真正的 fetch 在 SW 里跑（见 background/index.ts）。abort = 断开 Port，
// SW 侧 onDisconnect 会 AbortController.abort() 取消 fetch。
import type {
  LlmAskParams,
  LlmStreamHandlers,
  LlmStreamHandle,
  LlmTransport,
} from "@tachibana/shared";

export const portTransport: LlmTransport = {
  ask(
    { messages, context, settings }: LlmAskParams,
    handlers: LlmStreamHandlers
  ): LlmStreamHandle {
    const port = chrome.runtime.connect({ name: "llm-stream" });
    let settled = false;

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
      // SW 意外被回收 / 崩溃：尚未结算则提示重试。
      if (!settled) {
        settled = true;
        handlers.onError("与后台连接断开，请重试");
      }
    });

    port.postMessage({ type: "start", messages, context, settings });

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
