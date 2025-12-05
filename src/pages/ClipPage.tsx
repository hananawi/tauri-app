import { invoke } from "@tauri-apps/api/core";
import { info } from "@tauri-apps/plugin-log";
import { useState } from "react";
import {
  ScreenShotSelector,
  PropsType as ScreenShotSelectorPropsType,
} from "../components/ScreenShotSelector";
import { DetectionResultItem } from "../types/clip";

export const ClipPage = () => {
  // const [textVec, setTextVec] = useState<string[]>([]);
  const [detectedItems, setDetectedItems] = useState<DetectionResultItem[]>([]);

  const handleFinish: ScreenShotSelectorPropsType["onFinish"] = async (
    rect
  ) => {
    info(
      `info ScreenShotSelector finished, rect: ${JSON.stringify(rect, null, 2)}`
    );

    // Call backend OCR with the selected rect
    const results = await invoke<DetectionResultItem[]>("detect_text", {
      rect,
    });
    invoke("capture_screen", { rect });

    info(`Detected text: ${JSON.stringify(results, null, 2)}`);
    setDetectedItems(results);
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
