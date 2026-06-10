// 插件设置页：配置 LLM provider（api / openai / cloudflare）、预设 prompt，
// 并按需向 Chrome 申请「接口域名」的 host 权限（SW fetch 绕过 CORS 所需）。
// 不含桌面专属的 cli / 截图识别方式 / 网络代理（浏览器 fetch 走系统代理）。
import { useEffect, useMemo, useState } from "react";
import {
  createSettings,
  DEFAULT_TEXT_PRESET_PROMPT,
  type LlmProvider,
} from "@tachibana/shared";
import { chromeStore } from "../lib/chromeStore";

type ExtProvider = "api" | "openai" | "cloudflare";

const PROVIDER_OPTIONS: { value: ExtProvider; label: string; desc: string }[] = [
  {
    value: "api",
    label: "Base URL（Anthropic）",
    desc: "通过 Base URL + Auth Token 调用 Claude Messages 接口，文字以 messages 上送。",
  },
  {
    value: "openai",
    label: "OpenAI 兼容 API",
    desc: "走 /v1/chat/completions。适用 OpenAI、阿里百炼、Azure、智谱、Moonshot、OpenRouter、SiliconFlow 等。",
  },
  {
    value: "cloudflare",
    label: "Cloudflare AI Gateway（BYOK）",
    desc: "走 /compat/chat/completions（OpenAI 兼容），cf-aig-authorization 鉴权，cf-aig-byok-alias 指定别名。",
  },
];

// 由 base URL 推出 host 权限匹配模式，如 https://api.openai.com/*。
function toOriginPattern(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

const inputCls =
  "mt-1 w-full text-xs bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-400";
const labelCls = "text-xs font-medium text-neutral-600";

export const OptionsPage = () => {
  const settings = useMemo(
    () =>
      createSettings(chromeStore, {
        defaultPresetPrompt: DEFAULT_TEXT_PRESET_PROMPT,
      }),
    []
  );

  const [provider, setProvider] = useState<ExtProvider>("api");
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [cfBaseUrl, setCfBaseUrl] = useState("");
  const [cfAuth, setCfAuth] = useState("");
  const [cfAlias, setCfAlias] = useState("");
  const [cfModel, setCfModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [perm, setPerm] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(
    null
  );

  useEffect(() => {
    void (async () => {
      const p = await settings.getLlmProvider();
      // 插件不支持 cli，残留 cli 配置回退到 api。
      setProvider(p === "cli" ? "api" : p);
      setBaseUrl(await settings.getAnthropicBaseUrl());
      setAuthToken(await settings.getAnthropicAuthToken());
      setOpenaiBaseUrl(await settings.getOpenaiBaseUrl());
      setOpenaiApiKey(await settings.getOpenaiApiKey());
      setOpenaiModel(await settings.getOpenaiModel());
      setCfBaseUrl(await settings.getCloudflareBaseUrl());
      setCfAuth(await settings.getCloudflareAigAuthorization());
      setCfAlias(await settings.getCloudflareAigByokAlias());
      setCfModel(await settings.getCloudflareModel());
      setPrompt(await settings.getPresetPrompt());
    })();
  }, [settings]);

  const changeProvider = async (next: ExtProvider) => {
    setProvider(next);
    await settings.setLlmProvider(next as LlmProvider);
  };

  // 当前 provider 对应的接口 base URL。
  const activeBaseUrl =
    provider === "api"
      ? baseUrl
      : provider === "openai"
      ? openaiBaseUrl
      : cfBaseUrl;

  const requestPermission = async () => {
    setPerm(null);
    const pattern = toOriginPattern(activeBaseUrl);
    if (!pattern) {
      setPerm({ kind: "error", text: "Base URL 无效，无法解析域名" });
      return;
    }
    try {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      setPerm(
        granted
          ? { kind: "ok", text: `已授权访问 ${pattern}` }
          : { kind: "error", text: "授权被拒绝，接口请求将被 CORS 拦截" }
      );
    } catch (e) {
      setPerm({ kind: "error", text: `授权失败：${String(e)}` });
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 text-neutral-800">
      <h1 className="mb-1 text-lg font-semibold">划词问 AI · 设置</h1>
      <p className="mb-5 text-xs text-neutral-500">
        在任意网页选中文字，旁边浮现「问 AI」，点击即在页内浮层流式问答并可追问。
      </p>

      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">LLM 接口配置</h2>

        <div className="space-y-2">
          <span className={labelCls}>调用方式</span>
          {PROVIDER_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="llm-provider"
                className="mt-1"
                checked={provider === opt.value}
                onChange={() => void changeProvider(opt.value)}
              />
              <span>
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-neutral-500">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>

        {provider === "api" && (
          <>
            <label className="block">
              <span className={labelCls}>Base URL</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                onBlur={() => void settings.setAnthropicBaseUrl(baseUrl.trim())}
                placeholder="https://idealab.alibaba-inc.com/api/anthropic"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Auth Token</span>
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                onBlur={() => void settings.setAnthropicAuthToken(authToken.trim())}
                placeholder="Bearer Token"
                className={inputCls}
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
              <span className={labelCls}>Base URL</span>
              <input
                type="text"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                onBlur={() => void settings.setOpenaiBaseUrl(openaiBaseUrl.trim())}
                placeholder="https://api.openai.com/v1"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>API Key</span>
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                onBlur={() => void settings.setOpenaiApiKey(openaiApiKey.trim())}
                placeholder="sk-..."
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>模型</span>
              <input
                type="text"
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                onBlur={() => void settings.setOpenaiModel(openaiModel.trim())}
                placeholder="gpt-4o-mini"
                className={inputCls}
              />
            </label>
          </>
        )}

        {provider === "cloudflare" && (
          <>
            <label className="block">
              <span className={labelCls}>Base URL</span>
              <input
                type="text"
                value={cfBaseUrl}
                onChange={(e) => setCfBaseUrl(e.target.value)}
                onBlur={() => void settings.setCloudflareBaseUrl(cfBaseUrl.trim())}
                placeholder="https://gateway.ai.cloudflare.com/v1/{account}/{gateway}"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>cf-aig-authorization</span>
              <input
                type="password"
                value={cfAuth}
                onChange={(e) => setCfAuth(e.target.value)}
                onBlur={() =>
                  void settings.setCloudflareAigAuthorization(cfAuth.trim())
                }
                placeholder="Bearer 后的 token，可省略 Bearer 前缀"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>cf-aig-byok-alias</span>
              <input
                type="text"
                value={cfAlias}
                onChange={(e) => setCfAlias(e.target.value)}
                onBlur={() =>
                  void settings.setCloudflareAigByokAlias(cfAlias.trim())
                }
                placeholder="网关里配置的 BYOK 别名"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>模型</span>
              <input
                type="text"
                value={cfModel}
                onChange={(e) => setCfModel(e.target.value)}
                onBlur={() => void settings.setCloudflareModel(cfModel.trim())}
                placeholder="provider/model-name，如 anthropic/claude-3-5-sonnet-20241022"
                className={inputCls}
              />
            </label>
          </>
        )}

        <div className="rounded-md bg-neutral-50 p-3">
          <p className="mb-2 text-xs text-neutral-500">
            插件需要访问上面的接口域名才能发起请求（绕过网页 CORS）。配置好 Base URL
            后点此授权当前域名：
          </p>
          <button
            type="button"
            onClick={() => void requestPermission()}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
          >
            授权接口域名访问
          </button>
          {perm && (
            <p
              className={`mt-2 text-xs ${
                perm.kind === "ok"
                  ? "text-green-600"
                  : perm.kind === "error"
                  ? "text-red-500"
                  : "text-neutral-500"
              }`}
            >
              {perm.text}
            </p>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">预设 Prompt</h2>
        <p className="mb-2 text-xs text-neutral-500">
          每次划词问答时随选中文字一起发送给模型的指令，失焦自动保存。
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => void settings.setPresetPrompt(prompt.trim())}
          className="h-24 w-full resize-none rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-700 focus:border-blue-400 focus:outline-none"
        />
      </section>
    </div>
  );
};
