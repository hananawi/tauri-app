// LLM 编排层的核心类型，桌面端（Tauri）与浏览器插件（MV3）共用。
// UI 与「传输 / 存储」解耦：两端各自实现 LlmTransport / SettingsStore，
// 共享包只负责消息构造、SSE 解析、流式 fetch（插件端）与展示编排。

/** 一轮对话消息。整个对话历史（含本次追问）一起传输，以保留首图/首文上下文。 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/** 一次问答的输入上下文：桌面端为截图，插件端为网页选中文字。 */
export type LlmContext =
  | { kind: "image"; imagePath: string }
  | { kind: "text"; selectedText: string };

/** 流式状态机，驱动状态点 / loader / 输入框禁用等 UI。 */
export type Status = "idle" | "loading" | "streaming" | "done" | "error";

/**
 * provider 配置（不含会话相关字段）。结果窗口 / 浮层生命周期内不变，
 * 首轮读一次后缓存，追问复用。字段与桌面端后端 `ask_llm_about_image`
 * 的入参保持一致，便于 tauriTransport 直接展开传入。
 */
export interface ProviderSettings {
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
}

/** 流式回调：逐 token 增量 / 正常结束 / 出错。 */
export interface LlmStreamHandlers {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export interface LlmAskParams {
  messages: ChatMessage[];
  context: LlmContext;
  settings: ProviderSettings;
}

/** 一次流式请求的句柄；abort 由调用方在关闭 / 卸载时触发。 */
export interface LlmStreamHandle {
  abort: () => void;
}

/**
 * 传输抽象：把「发起一轮流式问答」与具体后端解耦。
 * - 桌面：tauriTransport —— invoke + listen('llm-result:chunk/done/error')。
 * - 插件：portTransport —— chrome.runtime.connect Port 代理到 SW，
 *   SW 内跑 createFetchLlmClient 做真正的 fetch 流式。
 */
export interface LlmTransport {
  ask(params: LlmAskParams, handlers: LlmStreamHandlers): LlmStreamHandle;
}
