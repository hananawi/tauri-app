import { listen } from "@tauri-apps/api/event";
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

export const LlmResultPage = () => {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const askingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = async () => {
      if (askingRef.current) return;
      const path = await takePendingCapture();
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

    void refresh();

    const unlistenPromises = [
      listen("llm-result:refresh", () => void refresh()),
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
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === "error"
              ? "bg-red-500"
              : status === "done"
              ? "bg-green-500"
              : status === "idle"
              ? "bg-neutral-300"
              : "bg-blue-500 animate-pulse"
          }`}
        />
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
        ) : (
          <div className="text-sm text-neutral-400">
            {status === "idle" ? "请先截图。" : "等待模型返回…"}
          </div>
        )}
        <div ref={bottomRef} />
      </main>
    </div>
  );
};
