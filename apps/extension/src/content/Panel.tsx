// 页内浮层卡片：用共享的 useChat + ChatView，输入上下文为网页选中文字，
// 传输走 portTransport（经 SW fetch），设置走 chromeStore。挂载即自动提问。
import { useCallback, useMemo } from "react";
import {
  ChatView,
  createSettings,
  DEFAULT_TEXT_PRESET_PROMPT,
  resolveModelName,
  useChat,
  type ChatInit,
  type ProviderSettings,
  type Status,
} from "@tachibana/shared";
import { chromeStore } from "../lib/chromeStore";
import { portTransport } from "./portTransport";

// 浮层固定尺寸，保证 header/正文/footer 的 flex 布局成立。
const PANEL_W = 384;
const PANEL_H = 460;
const MARGIN = 12;

const STATUS_LABELS: Record<Status, string> = {
  idle: "等待选择文字…",
  loading: "正在请求模型…",
  streaming: "生成中…",
  done: "已完成",
  error: "出错了",
};

export interface PanelProps {
  selectedText: string;
  /** 选区视口坐标，用于就近定位（会做边界收拢）。 */
  x: number;
  y: number;
  onClose: () => void;
}

export const Panel = ({ selectedText, x, y, onClose }: PanelProps) => {
  const settings = useMemo(
    () =>
      createSettings(chromeStore, {
        defaultPresetPrompt: DEFAULT_TEXT_PRESET_PROMPT,
      }),
    []
  );

  const init = useCallback(async (): Promise<ChatInit> => {
    const [
      provider,
      baseUrl,
      authToken,
      openaiBaseUrl,
      openaiApiKey,
      openaiModel,
      cloudflareBaseUrl,
      cloudflareAigAuthorization,
      cloudflareAigByokAlias,
      cloudflareModel,
      presetPrompt,
    ] = await Promise.all([
      settings.getLlmProvider(),
      settings.getAnthropicBaseUrl(),
      settings.getAnthropicAuthToken(),
      settings.getOpenaiBaseUrl(),
      settings.getOpenaiApiKey(),
      settings.getOpenaiModel(),
      settings.getCloudflareBaseUrl(),
      settings.getCloudflareAigAuthorization(),
      settings.getCloudflareAigByokAlias(),
      settings.getCloudflareModel(),
      settings.getPresetPrompt(),
    ]);

    // cli / sessionDir / proxyUrl 在浏览器端无意义，置空（fetchClient 不读它们）。
    const providerSettings: ProviderSettings = {
      provider,
      baseUrl,
      authToken,
      cliPath: "",
      sessionDir: "",
      openaiBaseUrl,
      openaiApiKey,
      openaiModel,
      cloudflareBaseUrl,
      cloudflareAigAuthorization,
      cloudflareAigByokAlias,
      cloudflareModel,
      proxyUrl: "",
    };

    return {
      context: { kind: "text", selectedText },
      settings: providerSettings,
      presetPrompt,
      model: resolveModelName(provider, openaiModel, cloudflareModel),
    };
  }, [settings, selectedText]);

  const chat = useChat({ transport: portTransport, init });

  // 边界收拢，保证浮层完整可见。
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - PANEL_W - MARGIN));
  const top = Math.max(MARGIN, Math.min(y, window.innerHeight - PANEL_H - MARGIN));

  return (
    <div
      className="pointer-events-auto animate-fade-in"
      style={{ position: "absolute", left, top, width: PANEL_W, height: PANEL_H }}
    >
      <ChatView
        variant="panel"
        onClose={onClose}
        statusLabels={STATUS_LABELS}
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
    </div>
  );
};
