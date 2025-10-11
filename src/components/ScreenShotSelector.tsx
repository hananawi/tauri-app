import { getCurrentWindow } from "@tauri-apps/api/window";
import Konva from "konva";
import { useEffect, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";

type Selection = { x: number; y: number; width: number; height: number };

type PropsType = {
  onFinish?: (rect: Selection) => void;
};

export const ScreenShotSelector: React.FC<PropsType> = ({ onFinish }) => {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Selection | null>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    setStart({ x: pos.x, y: pos.y });
    setRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!start) {
      return;
    }

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) {
      return;
    }

    setRect({
      x: start.x,
      y: start.y,
      width: pos.x - start.x,
      height: pos.y - start.y,
    });
  };

  const handleMouseUp = () => {
    setStart(null);
  };

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      console.log("rifa e", e);
      if (e.key === "Enter" && rect && onFinish) {
        const win = getCurrentWindow();
        const pos = await win.innerPosition();
        // Vision's SCScreenshotManager.captureImageInRect expects points (logical coords)
        const screenRect: Selection = {
          x: Math.round(pos.x + rect.x),
          y: Math.round(pos.y + rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        onFinish(screenRect);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rect, onFinish]);

  return (
    <Stage
      width={window.innerWidth}
      height={window.innerHeight}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {rect && (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            stroke="#00A3FF"
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
};
