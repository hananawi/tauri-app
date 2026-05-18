import { invoke } from "@tauri-apps/api/core";
import type { DetectionResultItem, Rect } from "../types/clip";

export async function detectText(rect: Rect): Promise<DetectionResultItem[]> {
  return invoke<DetectionResultItem[]>("detect_text", { rect });
}

export async function captureScreen(rect: Rect): Promise<void> {
  return invoke("capture_screen", { rect });
}

export async function genAudioFromText(text: string): Promise<void> {
  return invoke("gen_audio_from_text", { text });
}

export async function copyText(text: string): Promise<void> {
  return invoke("copy_text", { text });
}

export async function stopClipping(): Promise<void> {
  return invoke("stop_clipping");
}

export async function captureToTemp(rect: Rect): Promise<string> {
  return invoke<string>("capture_to_temp", { rect });
}

export async function takePendingCapture(): Promise<string | null> {
  return invoke<string | null>("take_pending_capture");
}

export async function askLlmAboutImage(args: {
  imagePath: string;
  prompt: string;
  provider: string;
  baseUrl: string;
  authToken: string;
  cliPath: string;
  sessionDir: string;
  dashscopeBaseUrl: string;
  dashscopeApiKey: string;
  dashscopeModel: string;
}): Promise<void> {
  return invoke("ask_llm_about_image", args);
}

export async function openLlmResultWindow(): Promise<void> {
  return invoke("open_llm_result_window");
}

export async function openSettingsWindow(): Promise<void> {
  return invoke("open_settings_window");
}
