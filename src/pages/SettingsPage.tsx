import { useEffect, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { updateClipShortcut, writeTextFile } from "../lib/commands";
import { IS_MAC, IS_WINDOWS } from "../lib/platform";
import {
  DEFAULT_CLIP_SHORTCUT,
  exportSettings,
  getAnthropicAuthToken,
  getAnthropicBaseUrl,
  getClaudeCliPath,
  getClipShortcut,
  getCloudflareAigAuthorization,
  getCloudflareAigByokAlias,
  getCloudflareBaseUrl,
  getCloudflareModel,
  getLlmProvider,
  getOpenaiApiKey,
  getOpenaiBaseUrl,
  getOpenaiModel,
  getPresetPrompt,
  getRecognitionMode,
  getSessionDir,
  importSettings,
  LlmProvider,
  RecognitionMode,
  setAnthropicAuthToken,
  setAnthropicBaseUrl,
  setClaudeCliPath,
  setClipShortcut,
  setCloudflareAigAuthorization,
  setCloudflareAigByokAlias,
  setCloudflareBaseUrl,
  setCloudflareModel,
  setLlmProvider,
  setOpenaiApiKey,
  setOpenaiBaseUrl,
  setOpenaiModel,
  setPresetPrompt,
  setRecognitionMode,
  setSessionDir,
} from "../lib/settings";

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

type TabKey = "shortcut" | "recognition" | "llm" | "prompt" | "backup";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "shortcut", icon: "⌨️", label: "快捷键" },
  { key: "recognition", icon: "🖼️", label: "识别方式" },
  { key: "llm", icon: "🤖", label: "LLM 接口" },
  { key: "prompt", icon: "💬", label: "Prompt" },
  { key: "backup", icon: "📦", label: "导入/导出" },
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
      value: "openai",
      label: "OpenAI 兼容 API",
      desc: "走 /v1/chat/completions，图片以 base64 data URI 内联上传。适用 OpenAI 官方、阿里百炼 / 通义千问 VL（DashScope 兼容模式）、Azure OpenAI、智谱 GLM-4V、Moonshot、OpenRouter、SiliconFlow 等。",
    },
    {
      value: "cloudflare",
      label: "Cloudflare AI Gateway（BYOK）",
      desc: "走 Cloudflare AI Gateway 的 /compat/chat/completions（OpenAI 兼容格式），通过 cf-aig-authorization 鉴权网关，cf-aig-byok-alias 指定别名让网关注入下游 provider 的 API key。模型字段形如 provider/model-name。",
    },
  ];

export const SettingsPage = () => {
  const [mode, setMode] = useState<RecognitionMode | null>(null);
  const [provider, setProvider] = useState<LlmProvider | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [cliPath, setCliPath] = useState("");
  const [sessionDir, setSessionDirState] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrlState] = useState("");
  const [openaiApiKey, setOpenaiApiKeyState] = useState("");
  const [openaiModel, setOpenaiModelState] = useState("");
  const [cfBaseUrl, setCfBaseUrlState] = useState("");
  const [cfAuth, setCfAuthState] = useState("");
  const [cfAlias, setCfAliasState] = useState("");
  const [cfModel, setCfModelState] = useState("");
  const [prompt, setPrompt] = useState("");
  const [shortcut, setShortcut] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("shortcut");
  const [backupMessage, setBackupMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getRecognitionMode().then(setMode);
    void getLlmProvider().then(setProvider);
    void getAnthropicBaseUrl().then(setBaseUrl);
    void getAnthropicAuthToken().then(setAuthToken);
    void getClaudeCliPath().then(setCliPath);
    void getSessionDir().then(setSessionDirState);
    void getOpenaiBaseUrl().then(setOpenaiBaseUrlState);
    void getOpenaiApiKey().then(setOpenaiApiKeyState);
    void getOpenaiModel().then(setOpenaiModelState);
    void getCloudflareBaseUrl().then(setCfBaseUrlState);
    void getCloudflareAigAuthorization().then(setCfAuthState);
    void getCloudflareAigByokAlias().then(setCfAliasState);
    void getCloudflareModel().then(setCfModelState);
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

  const handleOpenaiBaseUrlBlur = async () => {
    await setOpenaiBaseUrl(openaiBaseUrl.trim());
  };

  const handleOpenaiApiKeyBlur = async () => {
    await setOpenaiApiKey(openaiApiKey.trim());
  };

  const handleOpenaiModelBlur = async () => {
    await setOpenaiModel(openaiModel.trim());
  };

  const handleCfBaseUrlBlur = async () => {
    await setCloudflareBaseUrl(cfBaseUrl.trim());
  };

  const handleCfAuthBlur = async () => {
    await setCloudflareAigAuthorization(cfAuth.trim());
  };

  const handleCfAliasBlur = async () => {
    await setCloudflareAigByokAlias(cfAlias.trim());
  };

  const handleCfModelBlur = async () => {
    await setCloudflareModel(cfModel.trim());
  };

  const handlePromptBlur = async () => {
    await setPresetPrompt(prompt.trim());
  };

  const reloadAllSettings = async () => {
    const [
      m,
      p,
      bu,
      at,
      cp,
      sd,
      obu,
      oak,
      om,
      cfu,
      cfa,
      cfl,
      cfm,
      pp,
      sc,
    ] = await Promise.all([
      getRecognitionMode(),
      getLlmProvider(),
      getAnthropicBaseUrl(),
      getAnthropicAuthToken(),
      getClaudeCliPath(),
      getSessionDir(),
      getOpenaiBaseUrl(),
      getOpenaiApiKey(),
      getOpenaiModel(),
      getCloudflareBaseUrl(),
      getCloudflareAigAuthorization(),
      getCloudflareAigByokAlias(),
      getCloudflareModel(),
      getPresetPrompt(),
      getClipShortcut(),
    ]);
    setMode(m);
    setProvider(p);
    setBaseUrl(bu);
    setAuthToken(at);
    setCliPath(cp);
    setSessionDirState(sd);
    setOpenaiBaseUrlState(obu);
    setOpenaiApiKeyState(oak);
    setOpenaiModelState(om);
    setCfBaseUrlState(cfu);
    setCfAuthState(cfa);
    setCfAliasState(cfl);
    setCfModelState(cfm);
    setPrompt(pp);
    setShortcut(sc);
    return sc;
  };

  const handleExport = async () => {
    setBackupMessage(null);
    try {
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace(/T/, "_")
        .replace(/Z$/, "");
      const path = await save({
        title: "导出配置",
        defaultPath: `tachibana-settings_${ts}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const data = await exportSettings();
      await writeTextFile(path, JSON.stringify(data, null, 2));
      setBackupMessage({
        kind: "ok",
        text: `已导出 ${Object.keys(data).length} 项配置到 ${path}`,
      });
    } catch (err) {
      setBackupMessage({ kind: "error", text: `导出失败：${String(err)}` });
    }
  };

  const handleImportFile = async (file: File) => {
    setBackupMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { applied, skipped } = await importSettings(parsed);
      const newShortcut = await reloadAllSettings();
      try {
        await updateClipShortcut(newShortcut);
      } catch (err) {
        setBackupMessage({
          kind: "error",
          text: `配置已导入但快捷键重新注册失败：${String(err)}`,
        });
        return;
      }
      const skippedText =
        skipped.length > 0 ? `，忽略 ${skipped.length} 个未知字段` : "";
      setBackupMessage({
        kind: "ok",
        text: `已导入 ${applied.length} 项配置${skippedText}`,
      });
    } catch (err) {
      setBackupMessage({ kind: "error", text: `导入失败：${String(err)}` });
    }
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
              className={`flex flex-col items-center px-3 py-1 rounded-md border transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-700 border-blue-300"
                  : "text-neutral-500 border-transparent hover:bg-neutral-200/60"
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
            {MODE_OPTIONS.map((opt) => {
              // Windows 无本地 OCR，禁用该选项；其余平台正常可选。
              const disabled = IS_WINDOWS && opt.value === "ocr";
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 ${
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="recognition-mode"
                    className="mt-1"
                    checked={mode === opt.value}
                    disabled={disabled}
                    onChange={() => handleModeChange(opt.value)}
                  />
                  <span>
                    <span className="text-sm font-medium">
                      {opt.label}
                      {disabled && (
                        <span className="ml-1 text-xs font-normal text-neutral-400">
                          （仅 macOS）
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {opt.desc}
                    </span>
                  </span>
                </label>
              );
            })}
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
            {PROVIDER_OPTIONS.map((opt) => {
              // Windows 跑不了本地 Claude CLI，禁用该选项。
              const disabled = IS_WINDOWS && opt.value === "cli";
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 ${
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="radio"
                    name="llm-provider"
                    className="mt-1"
                    checked={provider === opt.value}
                    disabled={disabled}
                    onChange={() => handleProviderChange(opt.value)}
                  />
                  <span>
                    <span className="text-sm font-medium">
                      {opt.label}
                      {disabled && (
                        <span className="ml-1 text-xs font-normal text-neutral-400">
                          （仅 macOS）
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {opt.desc}
                    </span>
                  </span>
                </label>
              );
            })}
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

          {provider === "openai" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Base URL
                </span>
                <input
                  type="text"
                  value={openaiBaseUrl}
                  onChange={(e) => setOpenaiBaseUrlState(e.target.value)}
                  onBlur={handleOpenaiBaseUrlBlur}
                  placeholder="https://api.openai.com/v1"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  API Key
                </span>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKeyState(e.target.value)}
                  onBlur={handleOpenaiApiKeyBlur}
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
                  value={openaiModel}
                  onChange={(e) => setOpenaiModelState(e.target.value)}
                  onBlur={handleOpenaiModelBlur}
                  placeholder="gpt-4o-mini"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                走 Bearer Token + /v1/chat/completions，URL 可省略末尾 /v1。常用配置：
              </p>
              <ul className="text-xs text-neutral-400 list-disc pl-4 space-y-0.5">
                <li>
                  OpenAI：https://api.openai.com/v1 · gpt-4o / gpt-4o-mini / gpt-4.1
                </li>
                <li>
                  阿里百炼（通义千问 VL）：https://dashscope.aliyuncs.com/compatible-mode/v1 · qwen-vl-max-latest / qwen-vl-plus / qwen-vl-ocr-latest
                </li>
                <li>
                  其它：Azure OpenAI、智谱 GLM-4V、Moonshot、OpenRouter、SiliconFlow 等任何 OpenAI 兼容端点
                </li>
              </ul>
            </>
          )}

          {provider === "cloudflare" && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  Base URL
                </span>
                <input
                  type="text"
                  value={cfBaseUrl}
                  onChange={(e) => setCfBaseUrlState(e.target.value)}
                  onBlur={handleCfBaseUrlBlur}
                  placeholder="https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway}"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  cf-aig-authorization
                </span>
                <input
                  type="password"
                  value={cfAuth}
                  onChange={(e) => setCfAuthState(e.target.value)}
                  onBlur={handleCfAuthBlur}
                  placeholder="Bearer 后的 token，可省略 Bearer 前缀"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  cf-aig-byok-alias
                </span>
                <input
                  type="text"
                  value={cfAlias}
                  onChange={(e) => setCfAliasState(e.target.value)}
                  onBlur={handleCfAliasBlur}
                  placeholder="网关里配置的 BYOK 别名"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                  模型
                </span>
                <input
                  type="text"
                  value={cfModel}
                  onChange={(e) => setCfModelState(e.target.value)}
                  onBlur={handleCfModelBlur}
                  placeholder="provider/model-name，如 anthropic/claude-3-5-sonnet-20241022"
                  className="mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400"
                />
              </label>
              <p className="text-xs text-neutral-400">
                走 POST {`{base}/compat/chat/completions`}，OpenAI 兼容格式。Base URL 不含末尾 /compat。BYOK alias 由网关侧维护，下游 provider 的真实 API key 不会经过本机。
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

        {activeTab === "backup" && (
        <section className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-1">导出配置</h2>
            <p className="text-xs text-neutral-500 mb-2">
              把当前所有设置（包括 API Key、快捷键、Prompt 等）打包为 JSON 文件保存到本地。
            </p>
            <button
              type="button"
              onClick={handleExport}
              className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-700"
            >
              导出为 JSON
            </button>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1">导入配置</h2>
            <p className="text-xs text-neutral-500 mb-2">
              从之前导出的 JSON 文件恢复设置。文件中存在的字段会覆盖当前值，未在文件中的字段保持不变。
            </p>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) await handleImportFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 bg-neutral-50 hover:bg-neutral-100 text-neutral-700"
            >
              选择文件…
            </button>
          </div>

          {backupMessage && (
            <p
              className={`text-xs ${
                backupMessage.kind === "ok" ? "text-green-600" : "text-red-500"
              }`}
            >
              {backupMessage.text}
            </p>
          )}
        </section>
        )}
      </main>
    </div>
  );
};
