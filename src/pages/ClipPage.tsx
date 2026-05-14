import { info } from "@tauri-apps/plugin-log";
import { useEffect, useState } from "react";
import {
  ScreenShotSelector,
  PropsType as ScreenShotSelectorPropsType,
} from "../components/ScreenShotSelector";
import {
  captureScreen,
  captureToTemp,
  detectText,
  genAudioFromText,
  openLlmResultWindow,
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
    rect
  ) => {
    info(
      `info ScreenShotSelector finished, rect: ${JSON.stringify(rect, null, 2)}`
    );

    const mode = await getRecognitionMode();

    if (mode === "llm") {
      await captureToTemp(rect);
      await openLlmResultWindow();
      stopClipping();
      return;
    }

    const results = await detectText(rect);
    captureScreen(rect);

    info(`Detected text: ${JSON.stringify(results, null, 2)}`);
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
