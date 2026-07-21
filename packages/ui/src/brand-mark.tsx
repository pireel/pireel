import { useRef } from 'react';

interface Props {
  size?: number;
  /**
   * - `dark`: ink glyph, no background — for light surfaces.
   * - `light`: white glyph on ink background — for dark surfaces / favicons.
   */
  variant?: 'dark' | 'light';
  className?: string;
}

/**
 * π 字形本体（描边版）——横杠 + 微斜左腿 + 卷脚右腿，100×100 画布。
 * 单独导出给 chat 头像 / loading 等场景复用；颜色由 stroke 控制。
 *
 * 品牌叙事：pireel 的 pi 就是 π——无限、不循环（生成式创作的隐喻），
 * 又是圆的常数（思考动画做"绕 π 画圆"的轨道弧，见 chat AssistantAvatar）。
 */
export function PiGlyph({
  stroke,
  strokeWidth = 14,
}: {
  stroke: string;
  strokeWidth?: number;
}) {
  return (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* pathLength 归一到 100：静态渲染无影响，给 .pi-motion 的描边动画用 */}
      {/* 横杠 */}
      <path d="M12 28H88" pathLength={100} />
      {/* 左腿：底部微外撇 */}
      <path d="M34 28 30 80" pathLength={100} />
      {/* 右腿：直落后向右卷脚 */}
      <path d="M66 28v38q0 14 16 11" pathLength={100} />
    </g>
  );
}

/**
 * 入场即演的 π logo 动效（落地页 hero 用）：
 *   1. 主笔（ink）按书写顺序三笔描边画出（横杠 → 左腿 → 右腿）；lime/橙两层淡入
 *   2. 动的是 π 自己的笔画：横杠 seesaw 倾摆、两条腿绕顶端附着点甩、右腿的「勾」
 *      在最远端画大弧（脚尖点地感）；外层再叠整体 squash/stretch 弹跳（pi-body）
 *   3. 色差是运动驱动的——三层笔画摆幅不同（--amp），一动边缘就散开像拽开 RGB 通道，
 *      静下来收回 lime 左上 / 橙 右下的基位合并；偶发一帧"信号抖动" glitch
 * hover 交互：
 *   - 轨道环绕 π 画圆（与 chat 头像 thinking 弧同一母题：π = 圆的常数）
 *   - 指针移动时整簇按指针方向轻微视差跟随（--mx/--my，CSS 变量直写，不进 React
 *     状态；视差挂在外层 pi-pointer group 上，跟弹跳与逐笔摆动叠加）
 * 纯 CSS 驱动（globals.css 的 .pi-motion* / .pi-body / .pi-layer* / .pi-stroke-* 规则），
 * SSR 安全；prefers-reduced-motion 下直接定格成静态色差终态。
 */
export function AnimatedBrandMark({
  size = 88,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);

  function handleMove(e: React.MouseEvent) {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', String(((e.clientX - r.left) / r.width - 0.5) * 2));
    el.style.setProperty('--my', String(((e.clientY - r.top) / r.height - 0.5) * 2));
  }
  function handleLeave() {
    const el = frameRef.current;
    if (!el) return;
    el.style.setProperty('--mx', '0');
    el.style.setProperty('--my', '0');
  }

  return (
    <span
      ref={frameRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`pi-motion-frame block ${className}`}
      aria-label="Pireel"
    >
      <svg width={size} height={size} viewBox="0 0 100 100" className="pi-motion block">
        {/* 嵌套：pi-pointer(指针视差) > pi-body(整体弹跳) > 三色层(各自逐笔摆动)。
            顺序 lime → orange → ink，ink 压顶 */}
        <g className="pi-pointer">
          <g className="pi-body">
            <g className="pi-layer pi-layer-lime">
              <PiGlyph stroke="#c4f24c" />
            </g>
            <g className="pi-layer pi-layer-orange">
              <PiGlyph stroke="#e85a2a" />
            </g>
            <g className="pi-layer pi-layer-ink">
              <PiGlyph stroke="#17181b" />
            </g>
          </g>
        </g>
        <circle
          className="pi-motion-ring"
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="#17181b"
          strokeWidth="3.5"
          strokeLinecap="round"
          pathLength={100}
        />
      </svg>
    </span>
  );
}

/**
 * Pireel brand mark — π glyph with Douyin-style chromatic offset.
 * Main glyph flanked by lime (up-left) and accent-2 orange (down-right)
 * ghost copies so the symbol appears to have a color-channel shift at its
 * edges. P 字旧标已退役，字形换成 π；色差手法保留（视频文化的视觉语言）。
 */
export function BrandMark({
  size = 28,
  variant = 'dark',
  className = '',
}: Props) {
  // viewBox units — ~1.8/100 ≈ 1.8% chromatic offset, visible at every size.
  const shift = 1.8;
  const radius = 22;
  const mainColor = variant === 'light' ? '#ffffff' : '#17181b';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-label="Pireel"
    >
      {variant === 'light' && (
        <rect width="100" height="100" rx={radius} ry={radius} fill="#17181b" />
      )}
      <g transform={`translate(${-shift} ${-shift})`}>
        <PiGlyph stroke="#c4f24c" />
      </g>
      <g transform={`translate(${shift} ${shift})`}>
        <PiGlyph stroke="#e85a2a" />
      </g>
      <PiGlyph stroke={mainColor} />
    </svg>
  );
}
