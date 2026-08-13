# 橘子问 AI · Monorepo

截图 / 划词 → LLM 流式问答（气泡 + Markdown + 追问）。pnpm workspace 单仓，
桌面端与浏览器插件复用同一套 UI / LLM 客户端 / 设置抽象。

## 结构

```
.
├── packages/
│   └── shared/        # @tachibana/shared —— 复用核心（LLM 客户端 / useChat / ChatView / 设置抽象）
└── apps/
    ├── desktop/       # @tachibana/desktop —— Tauri 2 桌面端（截图问答）
    └── extension/     # @tachibana/extension —— Chrome MV3 插件（划词问答）
```

- **复用核心 `@tachibana/shared`**：以 TS 源码消费。把 UI 与「传输 / 存储」解耦，
  两端各实现 `LlmTransport`（桌面 `tauriTransport`：invoke+listen；插件 `portTransport`：Port→SW fetch）
  与 `SettingsStore`（桌面 `LazyStore`；插件 `chrome.storage.local`）。
- **桌面端**：LLM 请求走 Rust 后端（`src-tauri`，零改动）。
- **插件端**：用 TS `fetch + ReadableStream` 在 Service Worker 里重实现 3 个 HTTP provider
  （`api` / `openai` / `cloudflare`）；不支持 `cli` provider。

## 开发与构建

先在仓库根安装依赖：

```bash
pnpm install
```

桌面端：

```bash
pnpm dev:desktop      # = pnpm --filter @tachibana/desktop tauri dev
pnpm build:desktop    # 生产包
```

浏览器插件：

```bash
pnpm build:ext        # = pnpm --filter @tachibana/extension build
```

然后在 Chrome `chrome://extensions` 打开「开发者模式」→「加载已解压的扩展程序」→
选择 `apps/extension/dist`。任意网页选中文字 → 浮现「问 AI」→ 点击在页内浮层流式问答并可追问。
首次使用先在插件「选项」页配置 provider（Base URL / Key / 模型），并点「授权接口域名访问」。

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
