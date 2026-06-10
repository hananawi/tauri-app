import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// content script 必须是单 IIFE 文件（无代码分割 / 无动态 import）。
// 浮层样式只能以 shadow.css?inline 的字符串进 Shadow DOM，绝不能落成
// content_scripts.css（否则注入宿主页）。因此把 JS 里「裸 .css 副作用导入」
// （如 BlobLoader 组件的 import "./BlobLoader.css"）解析为空——其样式改由
// shadow.css 通过 @import 收进唯一的内联字符串。带 ?inline 的导入不受影响。
function ignoreBareCssSideEffects(): Plugin {
  const VIRTUAL = "\0empty-css";
  return {
    name: "ignore-bare-css-side-effects",
    enforce: "pre",
    resolveId(id) {
      if (id.endsWith(".css") && !id.includes("?")) return VIRTUAL + ":" + id;
      return null;
    },
    load(id) {
      if (id.startsWith(VIRTUAL)) return "";
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), ignoreBareCssSideEffects()],

  optimizeDeps: {
    exclude: ["@tachibana/shared"],
  },

  build: {
    outDir: "dist",
    // 主构建已 emptyOutDir，这里只追加 content.js，不要再清空。
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: "src/content/index.tsx",
      },
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
      },
    },
  },
});
