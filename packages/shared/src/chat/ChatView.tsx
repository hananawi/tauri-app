// 展示型聊天 UI，从 src/pages/LlmResultPage.tsx 抽出。props 驱动、variant 区分形态：
// - desktop：Tauri 结果窗口（不透明背景 + header 可拖拽 + 交通灯/窗口控件，h-screen）。
// - panel：浏览器插件浮层（卡片，h-full，右上角关闭按钮）。
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { BlobLoader } from "../components/BlobLoader";
import type { ChatMessage, Status } from "../llm/types";

export const DEFAULT_STATUS_LABELS: Record<Status, string> = {
  idle: "等待输入…",
  loading: "正在请求模型…",
  streaming: "生成中…",
  done: "已完成",
  error: "出错了",
};

// 用户气泡：右对齐，蓝底白字，保留换行。
const UserBubble = ({ text }: { text: string }) => (
  <div className="self-end max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-blue-500 px-3 py-2 text-sm text-white shadow-sm">
    {text}
  </div>
);

// 助手气泡：左对齐 Markdown 渲染。
const AssistantBubble = ({ text }: { text: string }) => (
  <div className="prose prose-sm prose-neutral max-w-none self-start prose-pre:bg-neutral-100 prose-pre:text-neutral-800">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {text}
    </ReactMarkdown>
  </div>
);

export interface ChatViewProps {
  variant: "desktop" | "panel";
  status: Status;
  error: string;
  model: string;
  visibleTurns: ChatMessage[];
  streaming: string;
  busy: boolean;
  input: string;
  setInput: (v: string) => void;
  submit: () => void;
  /** desktop + macOS：圆角 + 交通灯让位。 */
  isMac?: boolean;
  /** desktop + Windows：自绘窗口控件，渲染在 header 右侧。 */
  headerControls?: ReactNode;
  /** desktop：header 作为窗口拖拽区（data-tauri-drag-region）。 */
  headerDraggable?: boolean;
  /** panel：按下 header 拖动浮层（光标变为 move）。 */
  onHeaderMouseDown?: (e: ReactMouseEvent) => void;
  /** panel：右上角关闭按钮回调。 */
  onClose?: () => void;
  /** 覆盖状态文案（panel 的 idle 文案与 desktop 不同）。 */
  statusLabels?: Record<Status, string>;
  /** 空闲且无内容时的提示。 */
  emptyHint?: string;
  /** loader 文案。 */
  loaderLabel?: string;
}

export const ChatView = ({
  variant,
  status,
  error,
  model,
  visibleTurns,
  streaming,
  busy,
  input,
  setInput,
  submit,
  isMac = false,
  headerControls,
  headerDraggable = false,
  onHeaderMouseDown,
  onClose,
  statusLabels = DEFAULT_STATUS_LABELS,
  emptyHint,
  loaderLabel = "正在请求模型",
}: ChatViewProps) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  // 是否自动跟随到底部：用户向上滚动后暂停，滚回底部或发新提问时恢复。
  const followRef = useRef(true);
  const isPanel = variant === "panel";

  // 新内容出现时滚到底部（仅在跟随模式下）。
  useEffect(() => {
    const el = mainRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [visibleTurns, streaming, status]);

  const handleScroll = () => {
    const el = mainRef.current;
    if (!el) return;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const handleSubmit = () => {
    followRef.current = true;
    submit();
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const statusBlock = (
    <div className="pointer-events-none flex items-center gap-2">
      <span className="relative flex w-2 h-2">
        {busy && (
          <span className="absolute inline-flex w-full h-full rounded-full bg-blue-400 opacity-75 animate-ping" />
        )}
        <span
          className={`relative inline-flex w-2 h-2 rounded-full ${
            status === "error"
              ? "bg-red-500"
              : status === "done"
              ? "bg-green-500"
              : status === "idle"
              ? "bg-neutral-300"
              : "bg-blue-500"
          }`}
        />
      </span>
      <span className="text-sm font-medium">{statusLabels[status]}</span>
      {model && (
        <span
          title={model}
          className="max-w-[180px] truncate rounded-md bg-black/[0.06] px-2 py-0.5 text-xs font-medium text-neutral-500"
        >
          {model}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`flex flex-col overflow-hidden text-neutral-800 ${
        isPanel
          ? "h-full rounded-2xl border border-black/10 bg-white shadow-2xl"
          : `h-screen bg-neutral-50 ${isMac ? "rounded-xl" : ""}`
      }`}
    >
      <header
        {...(headerDraggable ? { "data-tauri-drag-region": true } : {})}
        onMouseDown={onHeaderMouseDown}
        className={`flex items-center gap-2 h-10 select-none border-b border-black/[0.06] ${
          isPanel
            ? `px-3 bg-neutral-50${onHeaderMouseDown ? " cursor-move" : ""}`
            : isMac
            ? "pl-20 pr-3"
            : "pl-4 pr-0 bg-neutral-100"
        }`}
      >
        {statusBlock}
        {!isPanel && headerControls}
        {isPanel && onClose && (
          <button
            aria-label="关闭"
            onClick={onClose}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-black/10 hover:text-neutral-700"
          >
            <svg width="12" height="12" viewBox="0 0 10 10">
              <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" />
              <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" />
            </svg>
          </button>
        )}
      </header>

      <main
        ref={mainRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col gap-3 overflow-auto bg-white px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {visibleTurns.map((turn, i) =>
          turn.role === "user" ? (
            <UserBubble key={i} text={turn.text} />
          ) : (
            <AssistantBubble key={i} text={turn.text} />
          )
        )}

        {/* 正在流式生成的本轮助手输出 */}
        {streaming ? (
          <AssistantBubble text={streaming} />
        ) : status === "loading" ? (
          <BlobLoader label={loaderLabel} />
        ) : null}

        {status === "error" && error && (
          <div className="self-start whitespace-pre-wrap text-sm text-red-600">
            {error}
          </div>
        )}

        {status === "idle" && visibleTurns.length === 0 && emptyHint && (
          <div className="text-sm text-neutral-400">{emptyHint}</div>
        )}
      </main>

      {/* 追问输入框：保留上下文与历史对话 */}
      <footer
        className="border-t border-black/[0.06] bg-neutral-100 px-3 py-2"
      >
        <div className="flex items-end gap-2 rounded-xl border border-black/10 bg-white/80 px-2.5 py-1.5 transition-colors focus-within:border-blue-400">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            disabled={status === "idle"}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              busy
                ? "正在回答，可继续输入…"
                : "继续追问（Enter 发送，Shift+Enter 换行）"
            }
            className="max-h-28 flex-1 resize-none bg-transparent text-sm leading-6 text-neutral-800 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15"
          />
          <button
            onClick={handleSubmit}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            发送
          </button>
        </div>
      </footer>
    </div>
  );
};
