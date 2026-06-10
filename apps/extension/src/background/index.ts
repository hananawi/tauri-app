// Service Worker：承载真正的 fetch 流式（CORS 由 host_permissions 绕过；
// content script 受宿主页 CSP/CORS 限制无法直接请求）。
//
// 通道：panel 通过 chrome.runtime.connect({name:'llm-stream'}) 开 Port，
// 发来 {type:'start', messages, context, settings}；SW 跑 createFetchLlmClient，
// 逐 delta postMessage({type:'chunk'})，结束 'done' / 失败 'error'。
// panel 关闭 → port.disconnect → onDisconnect → AbortController.abort() 取消 fetch。
// 流式期间每 ~20s 发一个 'ping'，避免 SW 在静默思考时被 idle 回收。
import { createFetchLlmClient } from "@tachibana/shared/llm/fetchClient";

const client = createFetchLlmClient();

// 点击工具栏图标打开设置页（action 无 popup 时触发）。
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "llm-stream") return;

  const controller = new AbortController();
  let pinger: ReturnType<typeof setInterval> | undefined;
  let started = false;

  const stopPinger = () => {
    if (pinger !== undefined) {
      clearInterval(pinger);
      pinger = undefined;
    }
  };

  const post = (msg: unknown) => {
    try {
      port.postMessage(msg);
    } catch {
      // Port 已断开，忽略。
    }
  };

  port.onDisconnect.addListener(() => {
    controller.abort();
    stopPinger();
  });

  port.onMessage.addListener((msg) => {
    // 无状态：每次 start 携带完整历史（与前端「传全量 messages」设计契合）。
    if (msg?.type !== "start" || started) return;
    started = true;

    // 开着的 Port 即 keepalive；流式期间再用 ping 兜底防 idle 回收。
    pinger = setInterval(() => post({ type: "ping" }), 20000);

    void client.stream(
      {
        messages: msg.messages,
        context: msg.context,
        settings: msg.settings,
        signal: controller.signal,
      },
      {
        onChunk: (text) => post({ type: "chunk", text }),
        onDone: () => {
          stopPinger();
          post({ type: "done" });
        },
        onError: (message) => {
          stopPinger();
          post({ type: "error", message });
        },
      }
    );
  });
});
