// LlmTransport 适配（桌面端）：流式问答由 Rust 后端完成。
// invoke('ask_llm_about_image') 发起请求，后端通过 emit_to(window_label, ...)
// 逐 token 回传事件 llm-result:chunk / :done / :error；本层监听并转成回调。
// abort 仅解监听 —— 结果窗口关闭时后端凭 AbortHandle 自动中止请求（见 lib.rs）。
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  LlmAskParams,
  LlmStreamHandlers,
  LlmStreamHandle,
  LlmTransport,
} from "@tachibana/shared";
import { askLlmAboutImage } from "../commands";

export const tauriTransport: LlmTransport = {
  ask(
    { messages, context, settings }: LlmAskParams,
    handlers: LlmStreamHandlers
  ): LlmStreamHandle {
    if (context.kind !== "image") {
      handlers.onError("桌面端仅支持截图输入");
      return { abort: () => {} };
    }

    let aborted = false;
    let unlisteners: UnlistenFn[] = [];
    const cleanup = () => {
      unlisteners.forEach((u) => u());
      unlisteners = [];
    };

    void (async () => {
      const windowLabel = getCurrentWindow().label;
      // 先注册监听再 invoke，避免错过早到的增量事件。
      const subs = await Promise.all([
        listen<string>("llm-result:chunk", (e) => handlers.onChunk(e.payload)),
        listen("llm-result:done", () => handlers.onDone()),
        listen<string>("llm-result:error", (e) => handlers.onError(e.payload)),
      ]);
      if (aborted) {
        subs.forEach((u) => u());
        return;
      }
      unlisteners = subs;

      try {
        await askLlmAboutImage({
          windowLabel,
          imagePath: context.imagePath,
          messages,
          ...settings,
        });
        // 正常结束以 llm-result:done 事件为准；invoke 仅在后端返回 Err 时 reject。
      } catch (e) {
        handlers.onError(String(e));
      }
    })();

    return {
      abort: () => {
        aborted = true;
        cleanup();
      },
    };
  },
};
