# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript UI (entry: `main.tsx`, root component: `App.tsx`).
- `src-tauri/`: Tauri Rust backend (`src/lib.rs`, `src/main.rs`, `Cargo.toml`).
- `src-tauri/tauri.conf.json`: Tauri app config; defines dev/build hooks and windows.
- `src-tauri/capabilities/`: Capability files (permissions for windows/plugins).
- `public/`: Static assets available at runtime.
- `index.html`, `vite.config.ts`: Vite bootstrap and config.

## Build, Test, and Development Commands
- `pnpm i`: Install JS/TS dependencies and Tauri CLI.
- `pnpm tauri dev`: Launch the desktop app with live reload (runs Vite + Rust).
- `pnpm dev`: Start only the Vite dev server (web preview).
- `pnpm build`: Type-check and build frontend to `dist/`.
- `pnpm tauri build`: Create a production desktop bundle (runs Rust + bundles assets).

## Coding Style & Naming Conventions
- TypeScript/React: 2-space indent; use `PascalCase` for components/files (`App.tsx`), `camelCase` for variables/functions, and kebab-case for asset files.
- Rust: 4-space indent; follow `rustfmt` defaults; public APIs `snake_case` for functions and `CamelCase` for types.
- Imports: prefer absolute-from-root within frontend as configured by Vite/TS, otherwise relative. Keep side-effect imports at top.

## Testing Guidelines
- Frontend: No test runner is configured yet. If adding tests, prefer Vitest + React Testing Library; name files `*.test.ts(x)` next to source.
- Rust: Place unit tests in-module under `#[cfg(test)]`; integration tests can go under `src-tauri/tests/`. Run with `cargo test` in `src-tauri/`.
- Target ≥80% coverage where practical; test UI behavior and Rust command boundaries (e.g., `greet`).

## Commit & Pull Request Guidelines
- Commits: Imperative mood and scoped, e.g., `feat(ui): add greet form validation`.
- PRs: Include purpose, summary of changes, screenshots for UI changes, and linked issues. Keep PRs focused and small; ensure `pnpm tauri dev` runs locally.

## Security & Configuration Tips
- Review permissions in `src-tauri/capabilities/*.json` and plugins in `Cargo.toml`; grant least privilege.
- Keep `tauri.conf.json` `security.csp` aligned with actual needs; avoid `null` in production.
- Never commit secrets; prefer OS keychains or the Tauri secure store plugin.
