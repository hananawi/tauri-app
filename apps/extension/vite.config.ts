import { cpSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// 把 manifest.json 与 icons/ 复制到 dist（构建产物即「加载已解压」的目录）。
function copyExtensionAssets(): Plugin {
  return {
    name: "copy-extension-assets",
    apply: "build",
    closeBundle() {
      cpSync("manifest.json", "dist/manifest.json");
      cpSync("icons", "dist/icons", { recursive: true });
    },
  };
}

// 主构建：background（ES module SW）+ options（HTML 页）+ 复制 manifest/icons。
// content script 因必须是单 IIFE 文件，单独由 vite.content.config.ts 构建。
export default defineConfig({
  plugins: [react(), tailwindcss(), copyExtensionAssets()],

  // @tachibana/shared 以 TS 源码消费，不预打包，保证 JSX 转换与 source 解析。
  optimizeDeps: {
    exclude: ["@tachibana/shared"],
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: "src/background/index.ts",
        options: "options.html",
      },
      output: {
        // background → background.js（manifest 里 service_worker 指向它）。
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
