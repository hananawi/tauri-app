# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript UI (entry: `main.tsx`, root: `App.tsx`).
- `src-tauri/`: Tauri Rust backend (`src/lib.rs`, `src/main.rs`, `Cargo.toml`).
- `src-tauri/tauri.conf.json`: App config (windows, dev/build hooks, security).
- `src-tauri/capabilities/`: Capability files (window/plugin permissions; least privilege).
- `public/`: Static assets available at runtime.
- `index.html`, `vite.config.ts`: Vite bootstrap and configuration.
- Tests: Rust unit tests in-module; integration tests in `src-tauri/tests/`. Frontend tests optional.

## Build, Test, and Development Commands
- `pnpm i`: Install JS/TS deps and Tauri CLI.
- `pnpm dev`: Start Vite dev server (web preview only).
- `pnpm tauri dev`: Launch desktop app with live reload (Vite + Rust).
- `pnpm build`: Type-check and build frontend to `dist/`.
- `pnpm tauri build`: Create production desktop bundle.
- `cd src-tauri && cargo test`: Run Rust unit/integration tests.

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
- PRs: Include purpose, summary of changes, linked issues, and screenshots for UI tweaks. Ensure `pnpm tauri dev` runs locally.

## Security & Configuration Tips
- Review `src-tauri/capabilities/*.json` and plugins in `Cargo.toml`; grant least privilege.
- Keep `tauri.conf.json` `security.csp` aligned with actual needs; avoid `null` in production.
- Never commit secrets; prefer OS keychains or Tauri secure store plugin.

