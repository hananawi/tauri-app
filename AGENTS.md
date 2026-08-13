# Repository Guidelines

## Project Structure & Module Organization
This is a **pnpm workspace monorepo**（根 `pnpm-workspace.yaml`：`apps/*` + `packages/*`）：
- `packages/shared/` (`@tachibana/shared`): 复用核心，以 TS 源码消费（`exports` 指向 `./src/index.ts`）。
  - `src/llm/`: LLM 客户端（`types`/`messages`/`sse`/`headers`/`fetchClient`，由 Rust 移植）。
  - `src/settings/`: `SettingsStore` 接口 + `createSettings(store)` 类型化读写（参数化存储）。
  - `src/chat/`: headless `useChat` 编排 hook + 展示型 `ChatView`（`variant: 'desktop'|'panel'`）。
  - `src/components/BlobLoader.*`、`src/styles/theme.css`: 两端共用的 loader 与共享 `@theme`。
- `apps/desktop/` (`@tachibana/desktop`): 原 Tauri 桌面端。
  - `src/`: React UI（`main.tsx`/`App.tsx`）；`LlmResultPage` 为薄适配层（`tauriTransport` + `tauriStore` + `useChat`/`ChatView`）。
  - `src-tauri/`: Tauri Rust 后端（`src/lib.rs`、`src/main.rs`、`Cargo.toml`、`tauri.conf.json`、`capabilities/`）。**后端代码零改动。**
  - `public/`、`index.html`、`vite.config.ts`: Vite 引导与配置。
- `apps/extension/` (`@tachibana/extension`): Chrome MV3 浏览器插件（划词问 AI）。
  - `src/content/`: 选区检测 + 浮动按钮 + Shadow DOM 浮层（`Panel` 用 `useChat` + `portTransport` + `chromeStore`）。
  - `src/background/`: Service Worker，`onConnect` Port + `createFetchLlmClient` 流式 + `AbortController` + ping keepalive。
  - `src/options/`: 设置页（`chromeStore` + provider 表单 + 按需 host 权限申请）。
  - `manifest.json`、`vite.config.ts`（bg+options）、`vite.content.config.ts`（content 单 IIFE）。
- Tests: Rust unit tests in-module; integration tests in `apps/desktop/src-tauri/tests/`. Frontend tests optional.

## Build, Test, and Development Commands
- `pnpm install`: 安装全部 workspace 依赖（在仓库根执行）。
- `pnpm --filter @tachibana/desktop tauri dev` (或根 `pnpm dev:desktop`): 启动桌面端（Vite + Rust 热重载）。
- `pnpm --filter @tachibana/desktop tauri build` (或根 `pnpm build:desktop`): 打桌面端生产包。
- `pnpm --filter @tachibana/extension build` (或根 `pnpm build:ext`): 构建插件到 `apps/extension/dist`（先 bg+options，再 content IIFE）。
  - Chrome `chrome://extensions` 开「开发者模式」→「加载已解压」→ 选 `apps/extension/dist`。
- `cd apps/desktop/src-tauri && cargo test`: Run Rust unit/integration tests.

## Coding Style & Naming Conventions
- TypeScript/React: 2-space indent; components/files `PascalCase` (e.g., `App.tsx`); variables/functions `camelCase`; asset files kebab-case.
- Rust: 4-space indent; `rustfmt` defaults; public functions `snake_case`, types `CamelCase`.
- Imports: Prefer absolute-from-root in frontend as configured by Vite/TS; keep side-effect imports at top.
- Formatting: Use editor formatting for TS/TSX; run `cargo fmt` in `src-tauri/` for Rust.

## Testing Guidelines
- Frontend: No runner configured. If adding tests, use Vitest + React Testing Library; name `*.test.ts(x)` next to source.
- Rust: Write unit tests inline under `#[cfg(test)]`; integration tests in `src-tauri/tests/`.
- Coverage: Target ≥80% where practical. Test UI behavior and Rust command boundaries (e.g., `greet`).

## Commit & Pull Request Guidelines
- Commits: Imperative, scoped (e.g., `feat(ui): add greet form validation`). Keep focused and small.
- PRs: Include purpose, summary of changes, linked issues, and screenshots for UI tweaks. Ensure `pnpm --filter @tachibana/desktop tauri dev` runs locally.

## Security & Configuration Tips
- Review `apps/desktop/src-tauri/capabilities/*.json` and plugins in `Cargo.toml`; grant least privilege.
- Keep `tauri.conf.json` `security.csp` aligned with actual needs; avoid `null` in production.
- 插件：`manifest.json` 用 `optional_host_permissions: ["<all_urls>"]`，在 options 页保存 base URL 后按需申请对应 origin；fetch 只在 Service Worker 跑（绕过宿主页 CORS）。
- Never commit secrets; prefer OS keychains or Tauri secure store plugin.
