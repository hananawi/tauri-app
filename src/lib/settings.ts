import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_PRESET_PROMPT } from "./prompt";

export type RecognitionMode = "ocr" | "llm";
export type LlmProvider = "api" | "cli";

const RECOGNITION_MODE_KEY = "recognitionMode";
const LLM_PROVIDER_KEY = "llmProvider";
const ANTHROPIC_BASE_URL_KEY = "anthropicBaseUrl";
const ANTHROPIC_AUTH_TOKEN_KEY = "anthropicAuthToken";
const CLAUDE_CLI_PATH_KEY = "claudeCliPath";
const SESSION_DIR_KEY = "sessionDir";
const PRESET_PROMPT_KEY = "presetPrompt";

const DEFAULT_MODE: RecognitionMode = "llm";
const DEFAULT_PROVIDER: LlmProvider = "api";
const DEFAULT_BASE_URL = "https://idealab.alibaba-inc.com/api/anthropic";
const DEFAULT_CLI_PATH = "claude";
const DEFAULT_SESSION_DIR = "tachibana-capture";

const store = new LazyStore("settings.json");

export async function getRecognitionMode(): Promise<RecognitionMode> {
  const mode = await store.get<RecognitionMode>(RECOGNITION_MODE_KEY);
  return mode ?? DEFAULT_MODE;
}

export async function setRecognitionMode(
  mode: RecognitionMode
): Promise<void> {
  await store.set(RECOGNITION_MODE_KEY, mode);
  await store.save();
}

export async function getLlmProvider(): Promise<LlmProvider> {
  const provider = await store.get<LlmProvider>(LLM_PROVIDER_KEY);
  return provider ?? DEFAULT_PROVIDER;
}

export async function setLlmProvider(provider: LlmProvider): Promise<void> {
  await store.set(LLM_PROVIDER_KEY, provider);
  await store.save();
}

export async function getClaudeCliPath(): Promise<string> {
  const path = await store.get<string>(CLAUDE_CLI_PATH_KEY);
  return path ?? DEFAULT_CLI_PATH;
}

export async function setClaudeCliPath(path: string): Promise<void> {
  await store.set(CLAUDE_CLI_PATH_KEY, path);
  await store.save();
}

export async function getSessionDir(): Promise<string> {
  const dir = await store.get<string>(SESSION_DIR_KEY);
  return dir ?? DEFAULT_SESSION_DIR;
}

export async function setSessionDir(dir: string): Promise<void> {
  await store.set(SESSION_DIR_KEY, dir);
  await store.save();
}

export async function getAnthropicBaseUrl(): Promise<string> {
  const url = await store.get<string>(ANTHROPIC_BASE_URL_KEY);
  return url ?? DEFAULT_BASE_URL;
}

export async function setAnthropicBaseUrl(url: string): Promise<void> {
  await store.set(ANTHROPIC_BASE_URL_KEY, url);
  await store.save();
}

export async function getAnthropicAuthToken(): Promise<string> {
  const token = await store.get<string>(ANTHROPIC_AUTH_TOKEN_KEY);
  return token ?? "";
}

export async function setAnthropicAuthToken(token: string): Promise<void> {
  await store.set(ANTHROPIC_AUTH_TOKEN_KEY, token);
  await store.save();
}

export async function getPresetPrompt(): Promise<string> {
  const prompt = await store.get<string>(PRESET_PROMPT_KEY);
  return prompt ?? DEFAULT_PRESET_PROMPT;
}

export async function setPresetPrompt(prompt: string): Promise<void> {
  await store.set(PRESET_PROMPT_KEY, prompt);
  await store.save();
}
