import { useEffect, useState } from "react";
import { updateClipShortcut } from "../lib/commands";
import {
  DEFAULT_CLIP_SHORTCUT,
  getAnthropicAuthToken,
  getAnthropicBaseUrl,
  getClaudeCliPath,
  getClipShortcut,
  getDashscopeApiKey,
  getDashscopeBaseUrl,
  getDashscopeModel,
  getLlmProvider,
  getPresetPrompt,
  getRecognitionMode,
  getSessionDir,
  LlmProvider,
  RecognitionMode,
  setAnthropicAuthToken,
  setAnthropicBaseUrl,
  setClaudeCliPath,
  setClipShortcut,
  setDashscopeApiKey,
  setDashscopeBaseUrl,
  setDashscopeModel,
  setLlmProvider,
  setPresetPrompt,
  setRecognitionMode,
  setSessionDir,
} from "../lib/settings";

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

const MODIFIER_CODES = new Set([
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "OSLeft",
  "OSRight",
]);

function buildShortcutFromEvent(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const mods: string[] = [];
  if (IS_MAC) {
    if (e.metaKey) mods.push("CommandOrControl");
    if (e.ctrlKey) mods.push("Control");
  } else {
    if (e.ctrlKey) mods.push("CommandOrControl");
    if (e.metaKey) mods.push("Super");
  }
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  return [...mods, e.code].join("+");
}

function formatToken(tok: string): string {
  if (IS_MAC) {
    const m: Record<string, string> = {
      CommandOrControl: "⌘",
      CmdOrCtrl: "⌘",
      Command: "⌘",
      Cmd: "⌘",
      Meta: "⌘",
      Super: "⌘",
      Control: "⌃",
      Ctrl: "⌃",
      Alt: "⌥",
      Option: "⌥",
      Shift: "⇧",
    };
    if (m[tok]) return m[tok];
  } else {
    const m: Record<string, string> = {
      CommandOrControl: "Ctrl",
      CmdOrCtrl: "Ctrl",
      Control: "Ctrl",
      Ctrl: "Ctrl",
      Alt: "Alt",
      Option: "Alt",
      Shift: "Shift",
      Super: "Win",
      Meta: "Win",
      Command: "Win",
    };
    if (m[tok]) return m[tok];
  }
  if (tok.startsWith("Key") && tok.length === 4) return tok.slice(3);
  if (tok.startsWith("Digit") && tok.length === 6) return tok.slice(5);
  if (tok === "ArrowUp") return "↑";
  if (tok === "ArrowDown") return "↓";
  if (tok === "ArrowLeft") return "←";
  if (tok === "ArrowRight") return "→";
  if (tok === "Escape") return "Esc";
  if (tok === "Backspace") return "⌫";
  if (tok === "Delete") return "⌦";
  return tok;
}

function formatShortcut(sc: string): string {
  if (!sc) return "";
  return sc.split("+").map(formatToken).join(IS_MAC ? "" : "+");
}

type TabKey = "shortcut" | "recognition" | "llm" | "prompt";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "shortcut", icon: "⌨️", label: "快捷键" },
  { key: "recognition", icon: "🖼️", label: "识别方式" },
  { key: "llm", icon: "🤖", label: "LLM 接口" },
  { key: "prompt", icon: "💬", label: "Prompt" },
];

const MODE_OPTIONS: { value: RecognitionMode; label: string; desc: string }[] =
  [
    {
      value: "llm",
      label: "LLM 智能问答",
      desc: "截图后调用 Claude API，按预设 prompt 识别并解释。",
    },
    {
      value: "ocr",
      label: "macOS 原生 OCR",
      desc: "使用系统 Vision 框架做本地文字识别。",
    },
  ];

const PROVIDER_OPTIONS: { value: LlmProvider; label: string; desc: string }[] =
  [
    {
      value: "api",
      label: "Base URL（HTTP API）",
      desc: "通过 Base URL + Auth Token 调用 Claude Messages 接口，图片以 base64 内联上传。",
    },
    {
      value: "cli",
      label: "本地 Claude Code CLI",
      desc: "调用本地 claude 命令的 -p 参数，输入纯文本，图片以临时文件的绝对路径传入由 CLI 自行读取。",
    },
    {
      value: "dashscope",
      label: "阿里百炼 / 通义千问 VL",
      desc: "走 DashScope OpenAI 兼容 /v1/chat/completions，图片以 base64 data URI 内联上传。新用户每模型 100 万输入 + 100 万输出 token 免费。",
    },
  ];

export const SettingsPage = () => {
  const [mode, setMode] = useState<RecognitionMode | null>(null);
  const [provider, setProvider] = useState<LlmProvider | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [cliPath, setCliPath] = useState("");
  const [sessionDir, setSessionDirState] = useState("");
  const [dashscopeBaseUrl, setDashscopeBaseUrlState] = useState("");
  const [dashscopeApiKey, setDashscopeApiKeyState] = useState("");
  const [dashscopeModel, setDashscopeModelState] = useState("");
  const [prompt, setPrompt] = useState("");
  const [shortcut, setShortcut] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("shortcut");

  useEffect(() => {
    void getRecognitionMode().then(setMode);
    void getLlmProvider().then(setProvider);
    void getAnthropicBaseUrl().then(setBaseUrl);
    void getAnthropicAuthToken().then(setAuthToken);
    void getClaudeCliPath().then(setCliPath);
    void getSessionDir().then(setSessionDirState);
    void getDashscopeBaseUrl().then(setDashscopeBaseUrlState);
    void getDashscopeApiKey().then(setDashscopeApiKeyState);
    void getDashscopeModel().then(setDashscopeModelState);
    void getPresetPrompt().then(setPrompt);
    void getClipShortcut().then(setShortcut);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const handler = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const sc = buildShortcutFromEvent(e);
      if (!sc) return;
      setRecording(false);
      try {
        await updateClipShortcut(sc);
        await setClipShortcut(sc);
        setShortcut(sc);
        setShortcutError(null);
      } catch (err) {
        setShortcutError(String(err));
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording]);

  const handleResetShortcut = async () => {
    try {
      await updateClipShortcut(DEFAULT_CLIP_SHORTCUT);
      await setClipShortcut(DEFAULT_CLIP_SHORTCUT);
      setShortcut(DEFAULT_CLIP_SHORTCUT);
      setShortcutError(null);
    } catch (err) {
      setShortcutError(String(err));
    }
  };

  const handleModeChange = async (next: RecognitionMode) => {
    setMode(next);
    await setRecognitionMode(next);
  };

  const handleProviderChange = async (next: LlmProvider) => {
    setProvider(next);
    await setLlmProvider(next);
  };

  const handleBaseUrlBlur = async () => {
    await setAnthropicBaseUrl(baseUrl.trim());
  };

  const handleAuthTokenBlur = async () => {
    await setAnthropicAuthToken(authToken.trim());
  };

  const handleCliPathBlur = async () => {
    await setClaudeCliPath(cliPath.trim());
  };

  const handleSessionDirBlur = async () => {
    await setSessionDir(sessionDir.trim());
  };

  const handleDashscopeBaseUrlBlur = async () => {
    await setDashscopeBaseUrl(dashscopeBaseUrl.trim());
  };

  const handleDashscopeApiKeyBlur = async () => {
    await setDashscopeApiKey(dashscopeApiKey.trim());
  };

  const handleDashscopeModelBlur = async () => {
    await setDashscopeModel(dashscopeModel.trim());
  };

  const handlePromptBlur = async () => {
    await setPresetPrompt(prompt.trim());
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-800">
      <header className="flex items-center gap-1 px-3 py-2 border-b border-neutral-200 bg-neutral-50">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center px-3 py-1 rounded-md transition-colors ${
                isActive
                  ? "bg-blue-500/10 text-blue-600"
                  : "text-neutral-500 hover:bg-neutral-200/60"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-xs mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </header>

      <main className="flex-1 overflow-auto p-5 space-y-5">
        {activeTab === "shortcut" && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold mb-1">截图快捷键</h2>
          <p className="text-xs text-neutral-500 mb-3">
            点击下方按钮，按下你想要的按键即可保存，可以是单键或组合键。按 Esc 取消录制（如需将 Esc 作为快捷键，请改用其它方式）。
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setShortcutError(null);
                setRecording(true);
              }}
              className={`min-w-[180px] text-sm border rounded-md px-3 py-2 font-mono text-center transition-colors ${
                recording
                  ? "border-blue-400 bg-blue-50 text-blue-600"
                  : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300"
              }`}
            >
              {recording
                ? "按下快捷键..."
                : shortcut
                  ? formatShortcut(shortcut)
                  : "未设置"}
            </button>
            <button
              type="button"
              onClick={handleResetShortcut}
              className="text-xs text-neutral-500 hover:text-neutral-700 underline-offset-2 hover:underline"
            >
              恢复默认
            </button>
          </div>
          {shortcutError && (
            <p className="mt-2 text-xs text-red-500">{shortcutError}</p>
          )}
        </section>
        )}

        {activeTab === "recognition" && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold mb-3">截图识别方式</h2>
          <div className="space-y-2">
            {MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="recognition-mode"
                  className="mt-1"
                  checked={mode === opt.value}
                  onChange={() => handleModeChange(opt.value)}
                />
                <span>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-neutral-500">
                    {opt.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
        )}

        {activeTab === "llm" && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold">LLM 接口配置</h2>

          <div className="space-y-2">
            <span className="text-xs font-medium text-neutral-600">
              调用方式
            </span>
            {PROVIDER_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="llm-provider"
                  className="mt-1"
                  checked={provider === opt.value}
                  onChange={() => handleProviderChange(opt.value)}
                />
                <span>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-neutral-500">
                    {opt.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {provider === "cli" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  claude 可执行文件路径
                </span>
                <input
                  type="text"
                  value={cliPath}
                  onChange={(e) => setCliPath(e.target.value)}
                  onBlur={handleCliPathBlur}
                  placeholder="claude 或 /opt/homebrew/bin/claude"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                GUI 应用不继承终端 PATH，建议填写 claude 的绝对路径（which
                claude 可查看）。
              </p>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  会话目录
                </span>
                <input
                  type="text"
                  value={sessionDir}
                  onChange={(e) => setSessionDirState(e.target.value)}
                  onBlur={handleSessionDirBlur}
                  placeholder="tachibana-capture"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                claude -p 的工作目录，决定会话记录落在
                ~/.claude/projects/ 下哪个目录。填相对名（如 tachibana-capture）则放在用户主目录下，也可填绝对路径。
              </p>
            </>
          )}

          {provider === "api" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Base URL
                </span>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  onBlur={handleBaseUrlBlur}
                  placeholder="https://idealab.alibaba-inc.com/api/anthropic"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Auth Token
                </span>
                <input
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  onBlur={handleAuthTokenBlur}
                  placeholder="idealab AK"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                走 Authorization: Bearer 认证；模型固定为 claude-opus-4-7。
              </p>
            </>
          )}

          {provider === "dashscope" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Base URL
                </span>
                <input
                  type="text"
                  value={dashscopeBaseUrl}
                  onChange={(e) => setDashscopeBaseUrlState(e.target.value)}
                  onBlur={handleDashscopeBaseUrlBlur}
                  placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  API Key
                </span>
                <input
                  type="password"
                  value={dashscopeApiKey}
                  onChange={(e) => setDashscopeApiKeyState(e.target.value)}
                  onBlur={handleDashscopeApiKeyBlur}
                  placeholder="sk-..."
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  模型
                </span>
                <input
                  type="text"
                  value={dashscopeModel}
                  onChange={(e) => setDashscopeModelState(e.target.value)}
                  onBlur={handleDashscopeModelBlur}
                  placeholder="qwen-vl-max-latest"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                到 bailian.console.aliyun.com 创建 API Key。常用视觉模型：
                qwen-vl-max-latest、qwen-vl-plus、qwen-vl-ocr-latest。该字段也可填其他 OpenAI 兼容 vision 端点（GLM-4V、Moonshot、SiliconFlow 等）。
              </p>
            </>
          )}
        </section>
        )}

        {activeTab === "prompt" && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold mb-1">预设 Prompt</h2>
          <p className="text-xs text-neutral-500 mb-2">
            每次截图问答时发送给模型的指令，失焦自动保存。
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onBlur={handlePromptBlur}
            className="w-full h-24 text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-md p-2 resize-none focus:outline-none focus:border-blue-400"
          />
        </section>
        )}
      </main>
    </div>
  );
};
