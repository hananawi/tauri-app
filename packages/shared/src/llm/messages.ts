// 各 provider 的 messages 数组构造，移植自 src-tauri/src/commands/llm.rs 的
// build_anthropic_messages / build_openai_messages，并扩展为支持
// image（截图，桌面端）与 text（网页选中文字，插件端）两种上下文。
//
// 与 Rust 一致：上下文（图片 / 选中文字）只挂在第一条 user 消息上，
// 后续追问为纯文本，保留同一上下文。

import type { ChatMessage, LlmContext } from "./types";

/** 把选中的网页文字拼进首轮 user 文本（preset prompt 在前，材料在后）。 */
function withSelection(promptText: string, selectedText: string): string {
  return `${promptText}\n\n以下是选中的网页文字：\n"""\n${selectedText}\n"""`;
}

/**
 * 构造 Anthropic `/v1/messages` 的 messages 数组。
 * - image 上下文：首条消息含 image 块 + text 块；其余轮次为纯 text 块。
 * - text  上下文：首条消息把选中文字拼进 text；其余轮次为纯 text。
 * image 上下文需提供 imageB64（base64，无 data: 前缀）。
 */
export function buildAnthropicMessages(
  messages: ChatMessage[],
  context: LlmContext,
  imageB64?: string
): Array<Record<string, unknown>> {
  return messages.map((turn, i) => {
    if (i === 0 && context.kind === "image") {
      return {
        role: turn.role,
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imageB64 ?? "",
            },
          },
          { type: "text", text: turn.text },
        ],
      };
    }
    const text =
      i === 0 && context.kind === "text"
        ? withSelection(turn.text, context.selectedText)
        : turn.text;
    return { role: turn.role, content: [{ type: "text", text }] };
  });
}

/**
 * 构造 OpenAI 兼容 `/chat/completions` 的 messages 数组。
 * - image 上下文：首条消息含 image_url 块 + text 块；其余轮次为纯文本字符串。
 * - text  上下文：首条消息把选中文字拼进文本字符串；其余轮次为纯文本字符串。
 * image 上下文需提供 dataUrl（data:image/png;base64,...）。
 */
export function buildOpenaiMessages(
  messages: ChatMessage[],
  context: LlmContext,
  dataUrl?: string
): Array<Record<string, unknown>> {
  return messages.map((turn, i) => {
    if (i === 0 && context.kind === "image") {
      return {
        role: turn.role,
        content: [
          { type: "image_url", image_url: { url: dataUrl ?? "" } },
          { type: "text", text: turn.text },
        ],
      };
    }
    const text =
      i === 0 && context.kind === "text"
        ? withSelection(turn.text, context.selectedText)
        : turn.text;
    return { role: turn.role, content: text };
  });
}
