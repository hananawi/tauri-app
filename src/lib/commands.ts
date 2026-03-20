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
