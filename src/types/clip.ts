export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectionResultItem = {
  text: string;
  rect: Rect;
};
