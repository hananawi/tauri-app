import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Konva from "konva";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Group, Layer, Rect, Stage } from "react-konva";
import { Html } from "react-konva-utils";
import { useEventListener } from "usehooks-ts";
import { DetectionResultItem } from "../types/clip";

type Selection = { x: number; y: number; width: number; height: number };

export type PropsType = {
  detectedItems?: DetectionResultItem[];
  onFinish?: (rect: Selection) => void;
  onBlur?: () => void;
};

export const ScreenShotSelector: React.FC<PropsType> = ({
  detectedItems,
  onFinish,
  onBlur,
}) => {
  console.log("detectedItems", detectedItems);

  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Selection | null>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) {
      return;
    }

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
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      width: Math.abs(pos.x - start.x),
      height: Math.abs(pos.y - start.y),
    });
  };

  const handleMouseUp = () => {
    setStart(null);
  };

  useEventListener("keypress", async (event) => {
    console.log("keypress event", event);

    if (event.key === "Enter" && rect && onFinish) {
      const win = getCurrentWindow();
      const pos = await win.innerPosition();

      console.log("rect position", pos, rect);

      // Vision's SCScreenshotManager.captureImageInRect expects points (logical coords)
      const screenRect: Selection = {
        x: Math.round(pos.x + rect.x),
        y: Math.round(pos.y + rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      onFinish(screenRect);
    }
  });

  useEffect(() => {
    const removeListenerPromise = listen("window-will-hide", () => {
      console.log("window hide");

      flushSync(() => {
        setStart(null);
        setRect(null);
        onBlur?.();
      });
    });

    return () => {
      removeListenerPromise.then((removeListener) => removeListener());
    };
  }, []);

  return (
    <Stage
      width={window.screen.width}
      height={window.screen.height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer listening={false}>
        <Rect
          x={0}
          y={0}
          width={window.screen.width}
          height={window.screen.height}
          fill="rgba(0, 0, 0, 0.3)"
        />

        {rect && rect.width > 0 && rect.height > 0 && (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="rgba(0,0,0,1)"
            globalCompositeOperation="destination-out"
          />
        )}

        {/* for overlay text */}
        {rect && detectedItems && detectedItems.length > 0 ? (
          <Group x={rect.x} y={rect.y}>
            {detectedItems.map((item, index) => (
              <Html groupProps={{ x: item.rect.x, y: item.rect.y }}>
                <div className="bg-white">{item.text}</div>
              </Html>
            ))}
          </Group>
        ) : null}
      </Layer>

      {/* for border */}
      <Layer>
        {rect && rect.width > 0 && rect.height > 0 && (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            stroke="#00A3FF"
            strokeWidth={2}
            dash={[6, 4]}
            listening={false}
            fillEnabled={false}
          />
        )}
      </Layer>
    </Stage>
  );
};
