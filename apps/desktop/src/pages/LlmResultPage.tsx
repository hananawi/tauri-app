import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback } from "react";
import {
  ChatView,
  resolveModelName,
  useChat,
  type ChatInit,
  type ProviderSettings,
  type Status,
} from "@tachibana/shared";
import { takePendingCapture } from "../lib/commands";
import { tauriTransport } from "../lib/llm/tauriTransport";
import {
  getAnthropicAuthToken,
  getAnthropicBaseUrl,
  getClaudeCliPath,
  getCloudflareAigAuthorization,
  getCloudflareAigByokAlias,
  getCloudflareBaseUrl,
  getCloudflareModel,
  getLlmProvider,
  getOpenaiApiKey,
  getOpenaiBaseUrl,
  getOpenaiModel,
  getPresetPrompt,
  getProxyUrl,
  getSessionDir,
} from "../lib/settings";

// macOS 交通灯悬浮：需要圆角，且 header 左侧要给交通灯让位。
const IS_MAC =
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

// 结果窗口的状态文案（idle 文案与共享默认不同）。
const STATUS_LABELS: Record<Status, string> = {
  idle: "等待截图…",
  loading: "正在请求模型…",
  streaming: "生成中…",
  done: "已完成",
  error: "出错了",
};

// Windows 无边框窗口：自绘最小化 / 最大化 / 关闭按钮（macOS 用系统交通灯）。
const WindowControls = () => {
  const win = getCurrentWindow();
  const btn =
    "flex h-full w-11 items-center justify-center text-neutral-500 transition-colors";
  return (
    <div className="ml-auto flex h-full items-center">
      <button
        aria-label="最小化"
        onClick={() => void win.minimize()}
        className={`${btn} hover:bg-black/10`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" />
        </svg>
      </button>
      <button
        aria-label="最大化"
        onClick={() => void win.toggleMaximize()}
        className={`${btn} hover:bg-black/10`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.75" y="0.75" width="8.5" height="8.5" stroke="currentColor" />
        </svg>
      </button>
      <button
        aria-label="关闭"
        onClick={() => void win.close()}
        className={`${btn} hover:bg-red-500 hover:text-white`}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" />
        </svg>
      </button>
    </div>
  );
};

export const LlmResultPage = () => {
  // 首轮初始化：取本窗口待处理截图 + 读 provider 设置 + 解析模型名。
  const init = useCallback(async (): Promise<ChatInit> => {
    const windowLabel = getCurrentWindow().label;
    const path = await takePendingCapture(windowLabel);

    const [
      provider,
      baseUrl,
      authToken,
      cliPath,
      sessionDir,
      openaiBaseUrl,
      openaiApiKey,
      openaiModel,
      cloudflareBaseUrl,
      cloudflareAigAuthorization,
      cloudflareAigByokAlias,
      cloudflareModel,
      proxyUrl,
      presetPrompt,
    ] = await Promise.all([
      getLlmProvider(),
      getAnthropicBaseUrl(),
      getAnthropicAuthToken(),
      getClaudeCliPath(),
      getSessionDir(),
      getOpenaiBaseUrl(),
      getOpenaiApiKey(),
      getOpenaiModel(),
      getCloudflareBaseUrl(),
      getCloudflareAigAuthorization(),
      getCloudflareAigByokAlias(),
      getCloudflareModel(),
      getProxyUrl(),
      getPresetPrompt(),
    ]);

    const settings: ProviderSettings = {
      provider,
      baseUrl,
      authToken,
      cliPath,
      sessionDir,
      openaiBaseUrl,
      openaiApiKey,
      openaiModel,
      cloudflareBaseUrl,
      cloudflareAigAuthorization,
      cloudflareAigByokAlias,
      cloudflareModel,
      proxyUrl,
    };

    return {
      context: path ? { kind: "image", imagePath: path } : null,
      settings,
      presetPrompt,
      model: resolveModelName(provider, openaiModel, cloudflareModel),
    };
  }, []);

  const chat = useChat({ transport: tauriTransport, init });

  return (
    <ChatView
      variant="desktop"
      isMac={IS_MAC}
      headerDraggable
      headerControls={IS_MAC ? undefined : <WindowControls />}
      statusLabels={STATUS_LABELS}
      emptyHint="请先截图。"
      status={chat.status}
      error={chat.error}
      model={chat.model}
      visibleTurns={chat.visibleTurns}
      streaming={chat.streaming}
      busy={chat.busy}
      input={chat.input}
      setInput={chat.setInput}
      submit={chat.submit}
    />
  );
};
