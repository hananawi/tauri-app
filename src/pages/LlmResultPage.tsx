import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askLlmAboutImage, takePendingCapture } from "../lib/commands";
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
  getSessionDir,
} from "../lib/settings";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

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

export const LlmResultPage = () => {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const askingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 每个结果窗口有唯一 label；后端按 label 定向派发流式事件，
    // 故多个窗口可同时存在、各自接收自己请求的输出而互不干扰。
    const windowLabel = getCurrentWindow().label;

    const start = async () => {
      if (askingRef.current) return;
      const path = await takePendingCapture(windowLabel);
      if (!path) return;

      askingRef.current = true;
      setText("");
      setError("");
      setStatus("loading");
      try {
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
          getPresetPrompt(),
        ]);
        await askLlmAboutImage({
          windowLabel,
          imagePath: path,
          prompt,
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
        });
      } catch (e) {
        setError(String(e));
        setStatus("error");
      } finally {
        askingRef.current = false;
      }
    };

    void start();

    const unlistenPromises = [
      listen<string>("llm-result:chunk", (e) => {
        setStatus("streaming");
        setText((prev) => prev + e.payload);
      }),
      listen("llm-result:done", () => setStatus("done")),
      listen<string>("llm-result:error", (e) => {
        setError(e.payload);
        setStatus("error");
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => p.then((un) => un()));
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [text]);

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
            {(status === "loading" || status === "streaming") && (
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
        </div>
        {!IS_MAC && <WindowControls />}
      </header>

      <main
        className={`flex-1 overflow-auto px-4 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/15 [&::-webkit-scrollbar-track]:bg-transparent ${
          IS_MAC ? "bg-white/30" : "bg-white"
        }`}
      >
        {status === "error" ? (
          <div className="text-sm text-red-600 whitespace-pre-wrap">
            {error}
          </div>
        ) : text ? (
          <div className="prose prose-sm prose-neutral max-w-none prose-pre:bg-neutral-100 prose-pre:text-neutral-800">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : status === "idle" ? (
          <div className="text-sm text-neutral-400">请先截图。</div>
        ) : (
          <BlobLoader
            label={status === "streaming" ? "正在生成内容" : "正在请求模型"}
          />
        )}
        <div ref={bottomRef} />
      </main>
    </div>
  );
};
