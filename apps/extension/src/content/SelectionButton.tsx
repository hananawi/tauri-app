// 选区旁浮现的「问 AI」按钮。位置由父组件用视口坐标（host 为 fixed 全屏覆盖层）定位。
// onMouseDown preventDefault：点按钮时不清掉页面选区。
export interface SelectionButtonProps {
  x: number;
  y: number;
  onClick: () => void;
}

export const SelectionButton = ({ x, y, onClick }: SelectionButtonProps) => (
  <button
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    style={{ position: "absolute", left: x, top: y }}
    className="pointer-events-auto flex items-center gap-1 rounded-full bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-black/10 transition-colors hover:bg-blue-600 animate-fade-in"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l2.09 4.26L18.5 8l-3.5 3.41.83 4.84L12 13.98 8.17 16.25 9 11.41 5.5 8l4.41-.74L12 3z"
        fill="currentColor"
      />
    </svg>
    问 AI
  </button>
);
