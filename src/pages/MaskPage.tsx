import { invoke } from "@tauri-apps/api/core";
import { ScreenShotSelector } from "../components/ScreenShotSelector";

export const MaskPage = () => {
  return (
    <div className="bg-transparent w-screen h-screen">
      mask page
      <ScreenShotSelector
        onFinish={(rect) => {
          console.log("ScreenShotSelector finished");

          // Call backend OCR with the selected rect
          // invoke("detect_text", { rect });
          invoke("capture_screen", { rect });
        }}
      />
    </div>
  );
};
