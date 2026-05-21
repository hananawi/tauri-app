import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askLlmAboutImage, takePendingCapture } from "../lib/commands";
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

const SHIMMER_BAR =
  "rounded bg-gradient-to-r from-neutral-200 via-neutral-50 to-neutral-200 bg-[length:200%_100%] animate-shimmer";

// 逐行递增的扫光延迟，让高光像一道波浪自上而下扫过骨架
const SHIMMER_DELAYS = [
  "[animation-delay:0ms]",
  "[animation-delay:-180ms]",
  "[animation-delay:-360ms]",
  "[animation-delay:-540ms]",
  "[animation-delay:-720ms]",
  "[animation-delay:-900ms]",
  "[animation-delay:-1080ms]",
];

// 每行 = 尺寸类 + 是否在其后留出段落空隙
const SKELETON_ROWS: { cls: string; gap?: boolean }[] = [
  { cls: "h-4 w-1/3" },
  { cls: "h-3 w-11/12" },
  { cls: "h-3 w-full" },
  { cls: "h-3 w-4/5", gap: true },
  { cls: "h-3 w-3/4" },
  { cls: "h-3 w-full" },
  { cls: "h-3 w-2/3" },
];

const LoadingSkeleton = ({ label }: { label: string }) => (
  <div className="flex flex-col gap-6 animate-fade-in">
    <div className="flex items-center gap-2 text-sm text-neutral-400">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.32s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.16s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
      </span>
    </div>
    <div className="flex flex-col gap-3">
      {SKELETON_ROWS.map((row, i) => (
        <div
          key={i}
          className={`${SHIMMER_BAR} ${row.cls} ${
            SHIMMER_DELAYS[i % SHIMMER_DELAYS.length]
          } ${row.gap ? "mb-3" : ""}`}
        />
      ))}
    </div>
  </div>
);

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
    <div className="flex flex-col h-screen bg-white text-neutral-800">
      <header className="flex items-center gap-2 px-4 py-2 border-b border-neutral-200 bg-neutral-50">
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
      </header>

      <main className="flex-1 overflow-auto px-4 py-3">
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
          <LoadingSkeleton
            label={status === "streaming" ? "正在生成内容" : "正在请求模型"}
          />
        )}
        <div ref={bottomRef} />
      </main>
    </div>
  );
};
