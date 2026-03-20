import { info } from "@tauri-apps/plugin-log";
import { useState } from "react";
import {
  ScreenShotSelector,
  PropsType as ScreenShotSelectorPropsType,
} from "../components/ScreenShotSelector";
import { captureScreen, detectText, genAudioFromText } from "../lib/commands";
import { DetectionResultItem } from "../types/clip";

export const ClipPage = () => {
  const [detectedItems, setDetectedItems] = useState<DetectionResultItem[]>([]);

  const handleFinish: ScreenShotSelectorPropsType["onFinish"] = async (
    rect
  ) => {
    info(
      `info ScreenShotSelector finished, rect: ${JSON.stringify(rect, null, 2)}`
    );

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
