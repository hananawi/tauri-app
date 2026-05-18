import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 独立于 vite.config.ts：测试用 jsdom，不需要 tauri dev server / tailwind。
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    restoreMocks: true,
  },
});
