import { invoke } from "@tauri-apps/api/core";
import type { DetectionResultItem, PixelRect } from "../types/clip";

/** 识别选区：后端裁冻屏图 → 写剪贴板 → OCR。display* 为选区逻辑尺寸。 */
export async function recognizeCapture(
  rect: PixelRect,
  displayWidth: number,
  displayHeight: number
): Promise<DetectionResultItem[]> {
  return invoke<DetectionResultItem[]>("recognize_capture", {
    rect,
    displayWidth,
    displayHeight,
  });
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

/** 把冻屏图按选区裁剪后存临时文件，返回路径（供 LLM 问答读取）。 */
export async function saveCaptureToTemp(rect: PixelRect): Promise<string> {
  return invoke<string>("save_capture_to_temp", { rect });
}

/** 取出指定结果窗口待处理的截图路径（按窗口 label 区分，仅消费一次）。 */
export async function takePendingCapture(
  windowLabel: string
): Promise<string | null> {
  return invoke<string | null>("take_pending_capture", { windowLabel });
}

export async function askLlmAboutImage(args: {
  windowLabel: string;
  imagePath: string;
  prompt: string;
  provider: string;
  baseUrl: string;
  authToken: string;
  cliPath: string;
  sessionDir: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  openaiModel: string;
  cloudflareBaseUrl: string;
  cloudflareAigAuthorization: string;
  cloudflareAigByokAlias: string;
  cloudflareModel: string;
}): Promise<void> {
  return invoke("ask_llm_about_image", args);
}

/** 为本次截图新建一个独立的识别结果窗口（多个窗口可并存）。 */
export async function openLlmResultWindow(imagePath: string): Promise<void> {
  return invoke("open_llm_result_window", { imagePath });
}

export async function openSettingsWindow(): Promise<void> {
  return invoke("open_settings_window");
}

export async function updateClipShortcut(shortcut: string): Promise<void> {
  return invoke("update_clip_shortcut", { shortcut });
}

export async function writeTextFile(
  path: string,
  contents: string
): Promise<void> {
  return invoke("write_text_file", { path, contents });
}
