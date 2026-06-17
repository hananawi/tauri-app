// 页内浮层卡片：用共享的 useChat + ChatView，输入上下文为网页选中文字，
// 传输走 portTransport（经 SW fetch），设置走 chromeStore。挂载即自动提问。
import type { MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
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

// 浮层初始尺寸 / 最小尺寸（右下角手柄可缩放）；保证 header/正文/footer 的 flex 布局成立。
const INIT_W = 384;
const INIT_H = 460;
const MIN_W = 320;
const MIN_H = 320;
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

  // 浮层尺寸：由右下角手柄缩放，左上角固定。
  const [size, setSize] = useState({ w: INIT_W, h: INIT_H });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // 视口边界收拢，保证浮层完整可见（按当前尺寸计算）。
  const clampPos = (l: number, t: number, w: number, h: number) => ({
    left: Math.max(MARGIN, Math.min(l, window.innerWidth - w - MARGIN)),
    top: Math.max(MARGIN, Math.min(t, window.innerHeight - h - MARGIN)),
  });

  // 初始就近定位；之后由拖拽更新。x/y 仅取挂载时的值。
  const [pos, setPos] = useState(() => clampPos(x, y, INIT_W, INIT_H));
  const posRef = useRef(pos);
  posRef.current = pos;

  // 按住 header 拖动：mousemove/up 挂到 window，避免快速拖出浮层后丢事件。
  const onHeaderMouseDown = useCallback((e: ReactMouseEvent) => {
    // 落在按钮（关闭）上的按下不触发拖拽，避免吞掉点击。
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = posRef.current;
    const onMove = (ev: MouseEvent) =>
      setPos(
        clampPos(
          origin.left + ev.clientX - startX,
          origin.top + ev.clientY - startY,
          sizeRef.current.w,
          sizeRef.current.h
        )
      );
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // 拖右下角手柄缩放：宽高夹在 [最小尺寸, 视口内剩余空间]，左上角不动。
  const onResizeMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = sizeRef.current;
    const { left, top } = posRef.current;
    const onMove = (ev: MouseEvent) =>
      setSize({
        w: Math.max(
          MIN_W,
          Math.min(origin.w + ev.clientX - startX, window.innerWidth - left - MARGIN)
        ),
        h: Math.max(
          MIN_H,
          Math.min(origin.h + ev.clientY - startY, window.innerHeight - top - MARGIN)
        ),
      });
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div
      className="pointer-events-auto animate-fade-in"
      style={{ position: "absolute", left: pos.left, top: pos.top, width: size.w, height: size.h }}
    >
      <ChatView
        variant="panel"
        onHeaderMouseDown={onHeaderMouseDown}
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

      {/* 右下角缩放手柄（落在 footer 右下角空白处，不挡发送按钮） */}
      <div
        onMouseDown={onResizeMouseDown}
        aria-hidden
        className="absolute bottom-0 right-0 z-10 flex h-4 w-4 cursor-nwse-resize items-end justify-end p-0.5 text-neutral-400 transition-colors hover:text-neutral-600"
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path
            d="M9 2 L2 9 M9 6 L6 9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
};
