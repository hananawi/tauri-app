import { invoke } from "@tauri-apps/api/core";
import { info } from "@tauri-apps/plugin-log";
import { ScreenShotSelector } from "../components/ScreenShotSelector";

export const MaskPage = () => {
  return (
    <div className="relative w-screen h-screen">
      <ScreenShotSelector
        onFinish={(rect) => {
          console.log("ScreenShotSelector finished");
          info("info ScreenShotSelector finished");

          // Call backend OCR with the selected rect
          // invoke("detect_text", { rect });
          invoke("capture_screen", { rect });
        }}
      />
    </div>
  );
};
