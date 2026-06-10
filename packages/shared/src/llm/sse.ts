// SSE 事件块解析，移植自 src-tauri/src/commands/llm.rs 的
// handle_sse_block（Anthropic）与 handle_openai_sse_block（OpenAI 兼容）。
//
// 调用方按 "\n\n" 切分出事件块后逐块传入，本模块解析其中的文本增量 /
// 结束 / 错误，并经回调向上传递。

export interface SseHandlers {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

/**
 * 解析一个 Anthropic SSE 事件块。
 * - content_block_delta + text_delta → onChunk
 * - message_stop → onDone
 * - error → onError
 */
export function handleAnthropicSseBlock(
  block: string,
  handlers: SseHandlers
): void {
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (!data) continue;

    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }

    switch (json?.type) {
      case "content_block_delta": {
        const delta = json.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          handlers.onChunk(delta.text);
        }
        break;
      }
      case "message_stop":
        handlers.onDone();
        break;
      case "error": {
        const msg = json.error?.message ?? "未知错误";
        handlers.onError(msg);
        break;
      }
      default:
        break;
    }
  }
}

/**
 * 解析一个 OpenAI 兼容 SSE 事件块：每行 `data: {...}`，结束标记 `data: [DONE]`，
 * 文本增量在 `choices[0].delta.content`，流内错误在 `error.message`。
 * [DONE] 本身不触发 onDone（结束由调用方在流读尽后统一处理）。
 */
export function handleOpenaiSseBlock(
  block: string,
  handlers: SseHandlers
): void {
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;

    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }

    if (json?.error) {
      handlers.onError(json.error.message ?? "未知错误");
      continue;
    }

    const text = json?.choices?.[0]?.delta?.content;
    if (typeof text === "string" && text.length > 0) {
      handlers.onChunk(text);
    }
  }
}
