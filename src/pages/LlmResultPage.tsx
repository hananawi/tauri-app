import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  askLlmAboutImage,
  takePendingCapture,
  type ChatMessage,
} from "../lib/commands";
import { BlobLoader } from "../components/BlobLoader";
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
import type { LlmProvider } from "../lib/settings";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

// 调用后端 ask_llm_about_image 所需的 provider 配置（不含会话相关字段）。
// 结果窗口生命周期内设置不变，故首轮读一次后缓存，追问复用。
type ProviderSettings = {
  provider: string;
  baseUrl: string;
  authToken: string;
  cliPath: string;
  sessionDir: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  cloudflareBaseUrl: string;
  cloudflareAigAuthorization: string;
  cloudflareAigByokAlias: string;
  cloudflareModel: string;
  proxyUrl: string;
};

// Anthropic API provider 的模型在后端固定，没有前端配置项。
// 与 src-tauri/src/commands/llm.rs 的 LLM_MODEL 常量保持一致。
const ANTHROPIC_API_MODEL = "claude-opus-4-7";

// 标题栏要展示的模型名：各 provider 取各自来源。
const resolveModelName = (
  provider: LlmProvider,
  openaiModel: string,
  cloudflareModel: string
): string => {
  switch (provider) {
    case "api":
      return ANTHROPIC_API_MODEL;
    case "cli":
      return "Claude CLI";
    case "openai":
      return openaiModel;
    case "cloudflare":
      return cloudflareModel;
  }
};

const STATUS_LABEL: Record<Status, string> = {
  idle: "等待截图…",
  loading: "正在请求模型…",
  streaming: "生成中…",
  done: "已完成",
  error: "出错了",
};

// macOS 走毛玻璃 + 交通灯悬浮：需要圆角，且 header 左侧要给交通灯让位
const IS_MAC =
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

// Windows 无边框窗口：自绘最小化 / 最大化 / 关闭按钮（macOS 用系统交通灯）
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

// 用户气泡：右对齐，蓝底白字，保留换行。
const UserBubble = ({ text }: { text: string }) => (
  <div className="self-end max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-blue-500 px-3 py-2 text-sm text-white shadow-sm">
    {text}
  </div>
);

// 助手气泡：左对齐 Markdown 渲染。
const AssistantBubble = ({ text }: { text: string }) => (
  <div className="prose prose-sm prose-neutral max-w-none self-start prose-pre:bg-neutral-100 prose-pre:text-neutral-800">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
  </div>
);

export const LlmResultPage = () => {
  // 已完成的对话轮次（首条为预设 prompt，不在界面展示，仅作上下文）。
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  // 当前正在流式生成的助手文本（尚未并入 turns）。
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");

  // 事件回调里读取的最新值用 ref，避免闭包拿到旧 state。
  const turnsRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef("");
  const askingRef = useRef(false);
  const imagePathRef = useRef("");
  const settingsRef = useRef<ProviderSettings | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 发起一轮问答：把本轮 user 文本追加进历史，连同首图一起发给后端，
  // 流式输出经事件回调累积，done 事件时并入 turns。
  const ask = async (userText: string) => {
    const settings = settingsRef.current;
    if (askingRef.current || !settings || !imagePathRef.current) return;
    askingRef.current = true;

    const next: ChatMessage[] = [
      ...turnsRef.current,
      { role: "user", text: userText },
    ];
    turnsRef.current = next;
    setTurns(next);
    streamingRef.current = "";
    setStreaming("");
    setError("");
    setStatus("loading");

    try {
      await askLlmAboutImage({
        windowLabel: getCurrentWindow().label,
        imagePath: imagePathRef.current,
        messages: next,
        ...settings,
      });
      // 正常结束以 done 事件为准（见 useEffect 内监听）；invoke 仅在后端
      // 返回 Err 时 reject，由下方 catch 处理。
    } catch (e) {
      setError(String(e));
      setStatus("error");
      askingRef.current = false;
    }
  };

  const submit = () => {
    const q = input.trim();
    if (!q || askingRef.current) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    void ask(q);
  };

  useEffect(() => {
    // 标题栏展示模型名 + 缓存 provider 设置（窗口生命周期内不变），随后发起首轮。
    const windowLabel = getCurrentWindow().label;

    const init = async () => {
      if (askingRef.current) return;
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
        prompt,
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

      settingsRef.current = {
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
      setModel(resolveModelName(provider, openaiModel, cloudflareModel));

      if (!path) {
        setStatus("idle");
        return;
      }
      imagePathRef.current = path;
      await ask(prompt);
    };

    void init();

    const unlistenPromises = [
      listen<string>("llm-result:chunk", (e) => {
        setStatus("streaming");
        streamingRef.current += e.payload;
        setStreaming(streamingRef.current);
      }),
      // 一轮结束：把流式文本并入对话历史，解锁输入框。
      listen("llm-result:done", () => {
        const finalText = streamingRef.current;
        if (finalText) {
          const committed: ChatMessage[] = [
            ...turnsRef.current,
            { role: "assistant", text: finalText },
          ];
          turnsRef.current = committed;
          setTurns(committed);
        }
        streamingRef.current = "";
        setStreaming("");
        setStatus("done");
        askingRef.current = false;
      }),
      listen<string>("llm-result:error", (e) => {
        setError(e.payload);
        setStatus("error");
        askingRef.current = false;
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((un) => un()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, streaming, status]);

  const busy = status === "loading" || status === "streaming";
  // 首条（预设 prompt）不展示，仅作上下文。
  const visibleTurns = turns.slice(1);

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden text-neutral-800 ${
        IS_MAC ? "rounded-xl" : "bg-neutral-50"
      }`}
    >
      <header
        data-tauri-drag-region
        className={`flex items-center gap-2 h-10 select-none border-b border-black/[0.06] ${
          IS_MAC ? "pl-20 pr-3" : "pl-4 pr-0 bg-neutral-100"
        }`}
      >
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
          <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
          {model && (
            <span
              title={model}
              className="max-w-[180px] truncate rounded-md bg-black/[0.06] px-2 py-0.5 text-xs font-medium text-neutral-500"
            >
              {model}
            </span>
          )}
        </div>
        {!IS_MAC && <WindowControls />}
      </header>

      <main
        className={`flex flex-1 flex-col gap-3 overflow-auto px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15 [&::-webkit-scrollbar-track]:bg-transparent ${
          IS_MAC ? "bg-white/30" : "bg-white"
        }`}
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
          <BlobLoader label="正在请求模型" />
        ) : null}

        {status === "error" && error && (
          <div className="self-start whitespace-pre-wrap text-sm text-red-600">
            {error}
          </div>
        )}

        {status === "idle" && visibleTurns.length === 0 && (
          <div className="text-sm text-neutral-400">请先截图。</div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* 追问输入框：保留首图与历史对话上下文 */}
      <footer
        className={`border-t border-black/[0.06] px-3 py-2 ${
          IS_MAC ? "bg-white/40" : "bg-neutral-100"
        }`}
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
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              busy ? "正在回答，可继续输入…" : "继续追问（Enter 发送，Shift+Enter 换行）"
            }
            className="max-h-28 flex-1 resize-none bg-transparent text-sm leading-6 text-neutral-800 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15"
          />
          <button
            onClick={submit}
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
