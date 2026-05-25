import { useState } from "react";
import "./BlobLoader.css";

// 一款 loader = 根元素 class + 直接子节点数量；ring 标记 20 号的 <span><i/></span> 结构
type LoaderSpec = { cls: string; parts: number; ring?: boolean };

// 用户选定的 15 款有机加载动画（对应原型页编号 4/5/6/7/8/10/11/12/13/14/16/17/18/19/20）
const LOADERS: LoaderSpec[] = [
  { cls: "bl-4", parts: 0 },
  { cls: "bl-5", parts: 2 },
  { cls: "bl-6", parts: 2 },
  { cls: "bl-7", parts: 3 },
  { cls: "bl-8", parts: 5 },
  { cls: "bl-10", parts: 5 },
  { cls: "bl-11", parts: 0 },
  { cls: "bl-12", parts: 0 },
  { cls: "bl-13", parts: 2 },
  { cls: "bl-14", parts: 3 },
  { cls: "bl-16", parts: 0 },
  { cls: "bl-17", parts: 2 },
  { cls: "bl-18", parts: 0 },
  { cls: "bl-19", parts: 0 },
  { cls: "bl-20", parts: 10, ring: true },
];

const pickLoader = () => LOADERS[Math.floor(Math.random() * LOADERS.length)];

/** 等待接口期间的加载占位：每次挂载从 15 款有机动画里随机抽一款。 */
export const BlobLoader = ({ label }: { label?: string }) => {
  // 惰性初始化：组件挂载时随机定一款，整个等待周期内保持不变
  const [spec] = useState(pickLoader);

  return (
    <div className="bl-wrap animate-fade-in">
      <div className={spec.cls}>
        {Array.from({ length: spec.parts }, (_, i) =>
          spec.ring ? (
            <span key={i}>
              <i />
            </span>
          ) : (
            <i key={i} />
          )
        )}
      </div>
      {label && <span className="bl-label">{label}</span>}

      {/* SVG goo 滤镜：05/06/07/08/10/17/20 的液态融合效果依赖它 */}
      <svg width="0" height="0" className="bl-defs" aria-hidden="true">
        <defs>
          <filter id="bl-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feColorMatrix
              in="b"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
            />
          </filter>
          <filter id="bl-goo-strong">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b" />
            <feColorMatrix
              in="b"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
};
