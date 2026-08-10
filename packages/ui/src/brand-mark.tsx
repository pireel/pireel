import { useRef } from 'react';

interface Props {
  size?: number;
  /**
   * - `dark`: ink glyph, no background — for light surfaces.
   * - `light`: white glyph on ink background — for dark surfaces / favicons.
   * - `chromatic`: Pireel's lime / orange / ink mark — reserved for product identity moments.
   * - `adaptive`: monochrome glyph using currentColor — for theme-aware product UI.
   */
  variant?: 'dark' | 'light' | 'chromatic' | 'adaptive';
  className?: string;
}

/**
 * π glyph (stroked) — bar + slightly slanted left leg + curled right foot, on a 100×100 canvas.
 * Exported standalone for reuse (chat avatar, loading, etc.); color comes from stroke.
 *
 * Brand story: pireel's "pi" is π — infinite, non-repeating (a metaphor for generative
 * creation), and the circle constant (the thinking animation traces an orbit arc "around π",
 * see chat AssistantAvatar).
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
      {/* pathLength normalized to 100: no effect on static render, used by .pi-motion stroke animation */}
      {/* bar */}
      <path d="M12 28H88" pathLength={100} />
      {/* left leg: flares out slightly at the bottom */}
      <path d="M34 28 30 80" pathLength={100} />
      {/* right leg: drops straight then curls right into a foot */}
      <path d="M66 28v38q0 14 16 11" pathLength={100} />
    </g>
  );
}

/**
 * Self-playing π logo animation (landing hero):
 *   1. Main stroke (ink) draws in writing order, three strokes (bar → left leg → right leg);
 *      lime/orange layers fade in.
 *   2. What moves is π's own strokes: the bar seesaws, both legs swing around their top anchor,
 *      the right leg's "hook" sweeps a large arc at its far end (toe-touching-ground feel);
 *      an outer layer adds an overall squash/stretch bounce (pi-body).
 *   3. The chromatic offset is motion-driven — the three layers have different swing amplitudes
 *      (--amp), so movement splays the edges like pulling RGB channels apart, and at rest they
 *      settle back to lime up-left / orange down-right; an occasional single-frame "signal jitter" glitch.
 * hover:
 *   - an orbit traces a circle around π (same motif as the chat avatar thinking arc: π = circle constant)
 *   - as the pointer moves, the whole cluster follows with a slight parallax in the pointer direction
 *     (--mx/--my written directly as CSS vars, not React state; parallax lives on the outer pi-pointer
 *     group, layered over the bounce and per-stroke swing)
 * Pure CSS (globals.css rules .pi-motion* / .pi-body / .pi-layer* / .pi-stroke-*), SSR-safe;
 * under prefers-reduced-motion it freezes to the static chromatic-offset end state.
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
        {/* Nesting: pi-pointer (pointer parallax) > pi-body (overall bounce) > three color layers
            (each with per-stroke swing). Order lime → orange → ink, ink on top. */}
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
 * ghost copies so the symbol appears to have a color-channel shift at its edges.
 */
export function BrandMark({
  size = 28,
  variant = 'dark',
  className = '',
}: Props) {
  // viewBox units — ~1.8/100 ≈ 1.8% chromatic offset, visible at every size.
  const shift = 1.8;
  const radius = 22;
  const mainColor = variant === 'adaptive' ? 'currentColor' : variant === 'light' ? '#ffffff' : '#17181b';
  const leadingColor = '#c4f24c';
  const trailingColor = '#e85a2a';

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
      {variant !== 'adaptive' && (
        <>
          <g transform={`translate(${-shift} ${-shift})`}>
            <PiGlyph stroke={leadingColor} />
          </g>
          <g transform={`translate(${shift} ${shift})`}>
            <PiGlyph stroke={trailingColor} />
          </g>
        </>
      )}
      <PiGlyph stroke={mainColor} />
    </svg>
  );
}
