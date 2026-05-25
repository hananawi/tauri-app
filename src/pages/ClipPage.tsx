import { info } from "@tauri-apps/plugin-log";
import { useEffect, useState } from "react";
import {
  ScreenShotSelector,
  PropsType as ScreenShotSelectorPropsType,
} from "../components/ScreenShotSelector";
import {
  genAudioFromText,
  openLlmResultWindow,
  recognizeCapture,
  saveCaptureToTemp,
  stopClipping,
} from "../lib/commands";
import { getRecognitionMode } from "../lib/settings";
import { DetectionResultItem } from "../types/clip";

export const ClipPage = () => {
  const [detectedItems, setDetectedItems] = useState<DetectionResultItem[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopClipping();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleFinish: ScreenShotSelectorPropsType["onFinish"] = async (
    rect,
    display
  ) => {
    info(`ScreenShotSelector finished, imgRect: ${JSON.stringify(rect)}`);

    const mode = await getRecognitionMode();

    if (mode === "llm") {
      // try/finally：任何一步抛错都必须把蒙层关掉。否则保存截图或开窗失败
      // 会让冻屏蒙层卡在屏幕最上层，Esc 焦点又不一定能拿到，用户只能重启电脑。
      try {
        const imagePath = await saveCaptureToTemp(rect);
        await openLlmResultWindow(imagePath);
      } finally {
        stopClipping();
      }
      return;
    }

    // OCR 模式：recognize_capture 会一并把截图写入剪贴板。
    const results = await recognizeCapture(rect, display.width, display.height);

    info(`Detected text: ${JSON.stringify(results)}`);
    setDetectedItems(results);
    genAudioFromText(results.map((item) => item.text).join(" "));
  };

  return (
    <div className="relative w-screen h-screen">
      <ScreenShotSelector
        detectedItems={detectedItems}
        onFinish={handleFinish}
        onBlur={() => {
          setDetectedItems([]);
        }}
      />
    </div>
  );
};
