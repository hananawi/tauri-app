export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 选区在冻屏图上的像素坐标（整数）。 */
export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectionResultItem = {
  text: string;
  rect: Rect;
};
