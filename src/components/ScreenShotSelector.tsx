import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Group, Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import { Html } from "react-konva-utils";
import { useEventListener } from "usehooks-ts";
import { copyText } from "../lib/commands";
import { DetectionResultItem, PixelRect } from "../types/clip";

type Selection = { x: number; y: number; width: number; height: number };
type StageSize = { width: number; height: number };

export type PropsType = {
  detectedItems?: DetectionResultItem[];
  onFinish?: (rect: PixelRect, display: StageSize) => void;
  onBlur?: () => void;
};

export const ScreenShotSelector: React.FC<PropsType> = ({
  detectedItems,
  onFinish,
  onBlur,
}) => {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Selection | null>(null);
  // 冻屏整图 + 蒙层窗口的逻辑尺寸。两者都就绪后才渲染选区 UI。
  const [frozenImg, setFrozenImg] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState<StageSize | null>(null);

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

  // 确认当前选区：换算到图片像素后回调 onFinish。选区无效则不响应。
  const finishSelection = () => {
    if (
      !rect ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      !frozenImg ||
      !stageSize ||
      !onFinish
    ) {
      return;
    }

    // 选区是 stage（逻辑）坐标；按 图片自然像素 / stage 尺寸 换算到图片像素。
    const scaleX = frozenImg.naturalWidth / stageSize.width;
    const scaleY = frozenImg.naturalHeight / stageSize.height;
    const imgRect: PixelRect = {
      x: Math.round(rect.x * scaleX),
      y: Math.round(rect.y * scaleY),
      width: Math.round(rect.width * scaleX),
      height: Math.round(rect.height * scaleY),
    };
    onFinish(imgRect, { width: rect.width, height: rect.height });
  };

  // Enter 确认选区。useEventListener 内部用 ref 持有 handler，闭包始终取最新值。
  // 用 keydown 而非已废弃的 keypress：keypress 在部分 WebView 下不触发。
  useEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      finishSelection();
    }
  });

  // 截图中再次按 clip 快捷键时也确认选区。用 ref 持有最新 finishSelection，
  // 避免 listen 的空依赖闭包捕获到过期的选区状态。
  const finishSelectionRef = useRef(finishSelection);
  finishSelectionRef.current = finishSelection;

  useEffect(() => {
    const removeListenerPromise = listen("clip-shortcut-again", () => {
      finishSelectionRef.current();
    });

    return () => {
      removeListenerPromise.then((removeListener) => removeListener());
    };
  }, []);

  // 截图开始：用后端下发的逻辑尺寸，并通过 clipimg:// 协议加载冻屏整图。
  useEffect(() => {
    const removeListenerPromise = listen<StageSize>(
      "window-will-show",
      (event) => {
        // stage 尺寸由后端按目标屏算好下发；前端自己读 innerSize() 会和
        // 窗口 resize 竞态，首次截图拿到旧的默认窗口尺寸把冻屏缩小。
        setStageSize(event.payload);

        // clipimg:// 从后端内存读冻屏整图；带时间戳绕过 webview 缓存。
        const img = new window.Image();
        img.onload = () => setFrozenImg(img);
        img.onerror = () => console.error("加载冻屏图失败");
        img.src = `${convertFileSrc("frozen", "clipimg")}?t=${Date.now()}`;
      }
    );

    return () => {
      removeListenerPromise.then((removeListener) => removeListener());
    };
  }, []);

  // 截图结束：清空冻屏图与选区状态。
  useEffect(() => {
    const removeListenerPromise = listen("window-will-hide", () => {
      flushSync(() => {
        setStart(null);
        setRect(null);
        setFrozenImg(null);
        onBlur?.();
      });
    });

    return () => {
      removeListenerPromise.then((removeListener) => removeListener());
    };
  }, []);

  // 冻屏图未就绪前不渲染：窗口透明，与实时桌面无异，用户无感。
  if (!frozenImg || !stageSize) {
    return null;
  }

  return (
    <Stage
      width={stageSize.width}
      height={stageSize.height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 冻屏底图 */}
      <Layer listening={false}>
        <KonvaImage
          image={frozenImg}
          width={stageSize.width}
          height={stageSize.height}
        />
      </Layer>

      <Layer listening={false}>
        {/* 半透黑背景覆盖 */}
        <Rect
          x={0}
          y={0}
          width={stageSize.width}
          height={stageSize.height}
          fill="rgba(0, 0, 0, 0.3)"
        />

        {/* 选区挖空（destination-out 露出下层冻屏底图） */}
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

        {/* OCR 识别结果显示 */}
        {rect && detectedItems && detectedItems.length > 0 ? (
          <Group x={rect.x} y={rect.y}>
            {detectedItems.map((item) => (
              <Html groupProps={{ x: item.rect.x, y: item.rect.y }}>
                <div className="bg-white p-2">{item.text}</div>
              </Html>
            ))}
          </Group>
        ) : null}

        {/* 复制文字按钮 */}
        {rect && detectedItems && detectedItems.length > 0 && (
          <Group x={rect.x} y={rect.y + rect.height + 8}>
            <Html>
              <div className="flex gap-2 px-2 py-1 bg-black/70 rounded-md">
                <button
                  onClick={() =>
                    copyText(detectedItems.map((i) => i.text).join("\n"))
                  }
                  className="text-white bg-transparent border-none cursor-pointer text-sm"
                >
                  复制文字
                </button>
              </div>
            </Html>
          </Group>
        )}
      </Layer>

      {/* 虚线边框 */}
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
