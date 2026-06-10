// content script（单 IIFE）：检测网页选区 → 浮现「问 AI」按钮 →
// 点击在 Shadow DOM 浮层里挂 Panel 流式问答。Esc / 外点 / 关闭按钮收起。
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Panel } from "./Panel";
import { SelectionButton } from "./SelectionButton";
// 编译后的浮层 CSS 字符串（带 tailwind/typography/共享样式），注入 shadowRoot。
import shadowCss from "./shadow.css?inline";

const HOST_ID = "tachibana-ask-ai-host";

interface Anchor {
  text: string;
  x: number;
  y: number;
}

function ContentApp({ host }: { host: HTMLElement }) {
  // 选区按钮锚点 / 已打开的浮层。
  const [sel, setSel] = useState<Anchor | null>(null);
  const [panel, setPanel] = useState<Anchor | null>(null);

  // 选区检测：在宿主页（host 之外）选中非空文字 → 记录按钮锚点。
  useEffect(() => {
    const inHost = (e: Event) => e.composedPath().includes(host);

    const onMouseUp = (e: MouseEvent) => {
      if (inHost(e)) return;
      // 等浏览器更新选区后再读。
      window.setTimeout(() => {
        const s = window.getSelection();
        const text = s?.toString().trim() ?? "";
        if (!text || !s || s.rangeCount === 0) return;
        const rect = s.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        setSel({ text, x: rect.left, y: rect.bottom + 8 });
      }, 0);
    };

    // 开始新交互（在宿主页按下）先收起按钮。
    const onMouseDown = (e: MouseEvent) => {
      if (inHost(e)) return;
      setSel(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSel(null);
        setPanel(null);
      }
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [host]);

  // 浮层打开时，点其外部（宿主页）关闭浮层。
  useEffect(() => {
    if (!panel) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!e.composedPath().includes(host)) setPanel(null);
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () =>
      document.removeEventListener("mousedown", onDocMouseDown, true);
  }, [panel, host]);

  const openPanel = () => {
    if (!sel) return;
    setPanel(sel);
    setSel(null);
  };

  return (
    <>
      {sel && !panel && (
        <SelectionButton x={sel.x} y={sel.y} onClick={openPanel} />
      )}
      {panel && (
        <Panel
          selectedText={panel.text}
          x={panel.x}
          y={panel.y}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}

function mount() {
  // 内容脚本每页只注入一次。
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  // 全屏覆盖层但不拦事件，仅按钮/浮层（pointer-events:auto）可点。
  host.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";

  const shadow = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  shadow.appendChild(container);

  // 编译后的 CSS 字符串注入 shadow；把落在文档 :root 的 token/preflight 重写到 :host。
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(shadowCss.replace(/:root\b/g, ":host"));
  shadow.adoptedStyleSheets = [sheet];

  (document.documentElement || document.body).appendChild(host);
  createRoot(container).render(<ContentApp host={host} />);
}

mount();
