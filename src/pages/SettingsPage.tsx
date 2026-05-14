import { useEffect, useState } from "react";
import {
  getAnthropicAuthToken,
  getAnthropicBaseUrl,
  getClaudeCliPath,
  getLlmProvider,
  getPresetPrompt,
  getRecognitionMode,
  getSessionDir,
  LlmProvider,
  RecognitionMode,
  setAnthropicAuthToken,
  setAnthropicBaseUrl,
  setClaudeCliPath,
  setLlmProvider,
  setPresetPrompt,
  setRecognitionMode,
  setSessionDir,
} from "../lib/settings";

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
  ];

export const SettingsPage = () => {
  const [mode, setMode] = useState<RecognitionMode | null>(null);
  const [provider, setProvider] = useState<LlmProvider | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [cliPath, setCliPath] = useState("");
  const [sessionDir, setSessionDirState] = useState("");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    void getRecognitionMode().then(setMode);
    void getLlmProvider().then(setProvider);
    void getAnthropicBaseUrl().then(setBaseUrl);
    void getAnthropicAuthToken().then(setAuthToken);
    void getClaudeCliPath().then(setCliPath);
    void getSessionDir().then(setSessionDirState);
    void getPresetPrompt().then(setPrompt);
  }, []);

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

  const handlePromptBlur = async () => {
    await setPresetPrompt(prompt.trim());
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-100 text-neutral-800">
      <header className="flex items-center gap-1 px-3 py-2 border-b border-neutral-200 bg-neutral-50">
        <div className="flex flex-col items-center px-3 py-1 rounded-md bg-blue-500/10 text-blue-600">
          <span className="text-base leading-none">⚙️</span>
          <span className="text-xs mt-0.5">通用</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-5 space-y-5">
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

          {provider === "cli" ? (
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
          ) : (
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
        </section>

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
      </main>
    </div>
  );
};
