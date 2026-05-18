import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// 模拟 Tauri 的 event listener：测试里手动 fire 事件。
type Listener<T> = (e: { payload: T }) => void;
const channels = new Map<string, Listener<unknown>[]>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener<unknown>) => {
    const arr = channels.get(event) ?? [];
    arr.push(cb);
    channels.set(event, arr);
    return () => {
      const a = channels.get(event);
      if (!a) return;
      channels.set(
        event,
        a.filter((x) => x !== cb),
      );
    };
  }),
}));

// 让 page 启动时 takePendingCapture 返回 null，避免触发 ask 调用。
vi.mock("../lib/commands", () => ({
  askLlmAboutImage: vi.fn(async () => undefined),
  takePendingCapture: vi.fn(async () => null),
}));

// settings 全部返回空字符串，page 仅消费值不做断言。
vi.mock("../lib/settings", () => ({
  getLlmProvider: vi.fn(async () => "api"),
  getAnthropicBaseUrl: vi.fn(async () => ""),
  getAnthropicAuthToken: vi.fn(async () => ""),
  getClaudeCliPath: vi.fn(async () => ""),
  getSessionDir: vi.fn(async () => ""),
  getDashscopeBaseUrl: vi.fn(async () => ""),
  getDashscopeApiKey: vi.fn(async () => ""),
  getDashscopeModel: vi.fn(async () => ""),
  getPresetPrompt: vi.fn(async () => ""),
}));

import { LlmResultPage } from "./LlmResultPage";

function fire(event: string, payload: unknown) {
  const cbs = channels.get(event);
  if (cbs) cbs.forEach((cb) => cb({ payload }));
}

// useEffect + 多个 await listen 之后才会全部注册到 channels；
// 用 microtask flush 等到 effect 跑完。
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  channels.clear();
});

describe("LlmResultPage", () => {
  test("初始展示 idle 文案", async () => {
    render(<LlmResultPage />);
    await flushEffects();
    expect(screen.getByText(/等待截图/)).toBeInTheDocument();
    expect(screen.getByText(/请先截图/)).toBeInTheDocument();
  });

  test("收到流式 chunk 后按 markdown 渲染并切到 streaming，最终 done 显示已完成", async () => {
    render(<LlmResultPage />);
    await flushEffects();

    await act(async () => {
      fire("llm-result:chunk", "Hello ");
      fire("llm-result:chunk", "**world**");
    });

    // ReactMarkdown 在 jsdom 下也能正常渲染 GFM。
    const strong = await screen.findByText("world");
    expect(strong.tagName.toLowerCase()).toBe("strong");
    expect(screen.getByText(/生成中/)).toBeInTheDocument();

    await act(async () => {
      fire("llm-result:done", null);
    });
    expect(screen.getByText(/已完成/)).toBeInTheDocument();
  });

  test("收到 error 事件展示错误文本，并切到 error 状态", async () => {
    render(<LlmResultPage />);
    await flushEffects();

    await act(async () => {
      fire("llm-result:error", "boom");
    });

    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText(/出错了/)).toBeInTheDocument();
  });
});
