/**
 * The Hyperframes block contract.
 *
 * A component render produces two strings that a host runtime turns into a live,
 * animated overlay:
 *
 *  - `html` — markup plus exactly one <style> block. Every CSS selector is scoped
 *    under the block id (`#<id> .value { … }`), so any number of blocks coexist in
 *    one document. Colors, fonts, radii and shadows are consumed through CSS custom
 *    properties (see {@link ThemeTokens}) with designed fallbacks, so the output
 *    renders well with no theme at all and recolors instantly when the host sets one.
 *
 *  - `timeline` — GSAP statements against an already-created, paused timeline named
 *    `tl`, in LOCAL time (0 = the moment the block enters). The host owns creation,
 *    seeking and disposal. Statements are deterministic: no Date, no randomness, no
 *    timers — seeking to any time yields the same frame (renders are replayable and
 *    export-safe).
 *
 * The kit never touches the DOM and has zero runtime dependencies: it is a pure
 * function from (component, props, context) to these two strings. GSAP is a host
 * expectation, not a kit dependency.
 */

/** What a component render returns. */
export interface RenderResult {
  /** Markup + one scoped <style> block. Never contains <script>. */
  html: string;
  /** GSAP statements against the paused timeline `tl`, local time. */
  timeline: string;
}

/**
 * Everything a component knows about where it will live.
 * Sizing is computed from `box` at render time — components emit concrete px,
 * so the same props re-render crisply for any box without runtime measurement.
 */
export interface RenderCtx {
  /** The block's box in canvas pixels. */
  box: { w: number; h: number };
  /** The full canvas in pixels (orientation hints, safe margins). */
  canvas: { w: number; h: number };
  /** BCP-47 language of the on-screen content (affects type metrics for CJK). */
  lang?: string;
  /** Block lifetime in seconds, when the host knows it — components with exit
   *  choreography (lower thirds) settle out before the end; absent = no exit. */
  durationSec?: number;
}

/**
 * Theme surface — every visual constant a component consumes, as CSS custom
 * properties. Hosts recolor the whole kit by setting these on any ancestor of the
 * block. Every token has a designed fallback, so an unthemed render is still
 * presentable.
 */
export const THEME_TOKENS = [
  '--sk-fg', //      ink on surfaces            (fallback #16181d)
  '--sk-muted', //   secondary ink              (fallback #6b7280)
  '--sk-accent', //  the one emphasis color     (fallback #2f6bff)
  '--sk-accent-2', // second series only        (fallback #ff5c7a)
  '--sk-panel', //   card surface               (fallback #ffffff)
  '--sk-panel-2', // inset/track surface        (fallback #eef1f6)
  '--sk-line', //    hairlines/dividers         (fallback #d7dbe2)
  '--sk-radius', //  corner radius              (fallback 20px)
  '--sk-shadow', //  card shadow                (fallback 0 12px 40px rgb(10 14 25 / 0.14))
  '--sk-font-head', // display face             (fallback ui-sans stack)
  '--sk-font-num', // numeral face              (fallback same stack, tabular)
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

/** var() reference with the token's designed fallback baked in. */
export function tk(token: ThemeToken): string {
  const fallback: Record<ThemeToken, string> = {
    '--sk-fg': '#16181d',
    '--sk-muted': '#6b7280',
    '--sk-accent': '#2f6bff',
    '--sk-accent-2': '#ff5c7a',
    '--sk-panel': '#ffffff',
    '--sk-panel-2': '#eef1f6',
    '--sk-line': '#d7dbe2',
    '--sk-radius': '20px',
    '--sk-shadow': '0 12px 40px rgb(10 14 25 / 0.14)',
    '--sk-font-head':
      "'Inter', 'SF Pro Display', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
    '--sk-font-num':
      "'Inter', 'SF Pro Display', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
  };
  return `var(${token}, ${fallback[token]})`;
}

/** Escape untrusted text for HTML text-node positions. All prop text passes through
 *  this at render — LLM/user content cannot inject markup by construction. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape text destined for a JS string literal inside a timeline (count-up targets etc.). */
export function escJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}
