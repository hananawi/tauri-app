// @tachibana/shared —— 桌面端与浏览器插件复用的核心：LLM 客户端、设置抽象、
// 聊天编排与展示组件。两端以 TS 源码消费（exports 指向 ./src/index.ts）。

// LLM
export * from "./llm/types";
export * from "./llm/headers";
export * from "./llm/messages";
export * from "./llm/sse";
export * from "./llm/fetchClient";

// 设置
export * from "./settings/store";
export * from "./settings/keys";
export * from "./settings/settings";

// prompt
export * from "./prompt";

// 聊天
export * from "./chat/useChat";
export * from "./chat/ChatView";
export * from "./chat/model";

// 组件
export { BlobLoader } from "./components/BlobLoader";
