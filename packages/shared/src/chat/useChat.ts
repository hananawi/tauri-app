// 聊天编排 hook，从 src/pages/LlmResultPage.tsx 抽出，去掉 Tauri/chrome 耦合：
// 通过注入的 LlmTransport 发起流式问答，通过 init() 异步解析上下文 / 设置 /
// 模型名。保留原 turnsRef/streamingRef/askingRef 与 StrictMode 单次 init 守卫。
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  LlmContext,
  LlmStreamHandle,
  LlmTransport,
  ProviderSettings,
  Status,
} from "../llm/types";

/** init() 解析出的首轮所需数据。 */
export interface ChatInit {
  /** 输入上下文（截图 / 选中文字）；为 null 表示无输入，停在 idle。 */
  context: LlmContext | null;
  /** provider 配置，窗口/浮层生命周期内不变，追问复用。 */
  settings: ProviderSettings;
  /** 首轮自动提问用的预设 prompt。 */
  presetPrompt: string;
  /** 展示用模型名。 */
  model: string;
}

export interface UseChatOptions {
  /** 传输实现（桌面 tauriTransport / 插件 portTransport）。须 useMemo 稳定。 */
  transport: LlmTransport;
  /** 异步解析首轮数据。只会被调用一次（StrictMode 双跑下也只跑一次）。 */
  init: () => Promise<ChatInit>;
  /** 解析到 context 后是否自动用 presetPrompt 发起首轮。默认 true。 */
  autoStart?: boolean;
}

export interface UseChatResult {
  /** 全部对话轮次（含首条预设 prompt）。 */
  turns: ChatMessage[];
  /** 去掉首条预设 prompt 后用于展示的轮次。 */
  visibleTurns: ChatMessage[];
  /** 当前正在流式生成的助手文本。 */
  streaming: string;
  status: Status;
  error: string;
  model: string;
  input: string;
  setInput: (v: string) => void;
  /** 提交输入框内容为一轮追问。 */
  submit: () => void;
  /** loading 或 streaming。 */
  busy: boolean;
}

export function useChat({
  transport,
  init,
  autoStart = true,
}: UseChatOptions): UseChatResult {
  // 已完成的对话轮次（首条为预设 prompt，不在界面展示，仅作上下文）。
  const [turns, setTurns] = useState<ChatMessage[]>([]);
  // 当前正在流式生成的助手文本（尚未并入 turns）。
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");

  // 流式回调里读取的最新值用 ref，避免闭包拿到旧 state。
  const turnsRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef("");
  const askingRef = useRef(false);
  // 保证首轮初始化只跑一次（StrictMode 双跑间 ref 保留）。
  const initStartedRef = useRef(false);
  const contextRef = useRef<LlmContext | null>(null);
  const settingsRef = useRef<ProviderSettings | null>(null);
  // 当前轮的流式句柄，开新一轮 / 卸载时中止。
  const handleRef = useRef<LlmStreamHandle | null>(null);

  // 发起一轮问答：把本轮 user 文本追加进历史，连同上下文一起经 transport 发出，
  // 流式输出经回调累积，done 时并入 turns。
  const ask = useCallback(
    (userText: string) => {
      const settings = settingsRef.current;
      const context = contextRef.current;
      if (askingRef.current || !settings || !context) return;
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

      // 开新一轮前断开上一轮订阅，避免回调串台。
      handleRef.current?.abort();
      handleRef.current = transport.ask(
        { messages: next, context, settings },
        {
          onChunk: (t) => {
            setStatus("streaming");
            streamingRef.current += t;
            setStreaming(streamingRef.current);
          },
          // 一轮结束：把流式文本并入对话历史，解锁输入框。
          onDone: () => {
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
          },
          onError: (m) => {
            setError(m);
            setStatus("error");
            askingRef.current = false;
          },
        }
      );
    },
    [transport]
  );

  const submit = useCallback(() => {
    const q = input.trim();
    if (!q || askingRef.current) return;
    setInput("");
    ask(q);
  }, [input, ask]);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    let cancelled = false;

    void (async () => {
      const resolved = await init();
      if (cancelled) return;
      settingsRef.current = resolved.settings;
      contextRef.current = resolved.context;
      setModel(resolved.model);
      if (resolved.context && autoStart) {
        ask(resolved.presetPrompt);
      } else if (!resolved.context) {
        setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
      handleRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === "loading" || status === "streaming";
  // 首条（预设 prompt）不展示，仅作上下文。
  const visibleTurns = turns.slice(1);

  return {
    turns,
    visibleTurns,
    streaming,
    status,
    error,
    model,
    input,
    setInput,
    submit,
    busy,
  };
}
