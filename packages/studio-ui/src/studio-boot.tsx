'use client';

/**
 * Entry boot layer: won't let you through until both are done —
 *  1. Warm up heavy assets (MODNet 26M + ort wasm 27M + GSAP): streaming fetch into HTTP cache,
 *     real byte-level progress; person matte/preview open instantly when later needed. Failure/404 doesn't block entry (an OSS shell may lack these files).
 *  2. Wait for project data to settle (the cloud-first-then-local auto-restore finishing, passed in via dataReady).
 * Background = a pure-CSS theme card wall drawn from the frame catalog (useFrameCatalog) palettes, columns cross-scrolling + blurred
 * — not running 22 GSAP iframes (a loading screen should be lightweight); the blur hides the difference anyway.
 * Warm-up is module-level, once: switching projects and remounting the workbench doesn't refetch, progress just continues from its completed state.
 */

import { useEffect, useMemo, useState } from 'react';
import { PiGlyph } from '@pireel/ui/brand-mark';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';
import { modnetUrl, ortWasmUrls } from './matte-assets';
import { t } from './i18n';

interface WarmAsset {
  url: string;
  /** Actual on-disk byte count (the progress denominator; transfer compression doesn't affect the decompressed bytes the reader sees) */
  bytes: number;
}

// Sizes hand-copied from the actual files in public/ — just progress weights, no need for byte accuracy.
// URLs come from matte-assets (same URL with ?v= stamp as person-matte's real load, so warm-up actually hits the cache;
// if the constant rev drifts from the runtime ort version it only wastes this warm-up, functionality unaffected).
// Lazy evaluation: the CDN base in the URL is injected by the shell (setMatteAssetBase); reading at module top level would race ahead of injection.
const warmAssets = (): WarmAsset[] => [
  { url: modnetUrl(), bytes: 25_888_640 },
  { url: ortWasmUrls().wasm, bytes: 26_827_543 },
  { url: '/vendor/gsap.min.js', bytes: 72_927 },
];
const TOTAL_WARM_BYTES = 25_888_640 + 26_827_543 + 72_927;
/** Hard ceiling on asset waiting: don't block the door forever on slow networks, enter at the deadline (warm-up keeps running in the background). */
const WARM_WAIT_CEILING_MS = 20_000;
const MIN_HOLD_MS = 1_800; // play the full intro even on a full cache hit (user's call: too fast feels like no experience)
const FADE_MS = 450;
/** Progress-bar display floor: however fast real progress is, the shown value fills evenly over this duration — no flash to 100% then idle wait */
const PROGRESS_RAMP_MS = 1_400;

let warmStarted = false;
let warmLoaded = 0; // monotonically increasing, module-level — reused across remount/project switch
const warmListeners = new Set<(ratio: number) => void>();
const warmRatio = () => Math.min(1, warmLoaded / TOTAL_WARM_BYTES);

async function warmOne(a: WarmAsset): Promise<void> {
  let seen = 0;
  const bump = (n: number) => {
    const inc = Math.min(n, a.bytes - seen);
    if (inc <= 0) return;
    seen += inc;
    warmLoaded += inc;
    const r = warmRatio();
    for (const l of warmListeners) l(r);
  };
  try {
    const res = await fetch(a.url, { credentials: 'same-origin' });
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bump(value.byteLength);
      }
    }
  } catch {
    /* network failure doesn't block entry */
  }
  bump(a.bytes); // failure/404/size mismatch: top up to full regardless — progress only means "the warm-up flow ran to completion"
}

/** Warm-up progress 0..1 (starts on mount, runs once at module level). */
function useWarmProgress(): number {
  const [ratio, setRatio] = useState(warmRatio);
  useEffect(() => {
    warmListeners.add(setRatio);
    if (!warmStarted) {
      warmStarted = true;
      void Promise.all(warmAssets().map(warmOne));
    }
    setRatio(warmRatio());
    return () => {
      warmListeners.delete(setRatio);
    };
  }, []);
  return ratio;
}

/** Entry boot overlay: asset warm-up + dataReady dual gate; fades out and self-unmounts when done. */
export function StudioBootOverlay({ dataReady }: { dataReady: boolean }) {
  const warm = useWarmProgress();
  const frames = useFrameCatalog();
  const [minHoldDone, setMinHoldDone] = useState(false);
  const [warmWaived, setWarmWaived] = useState(false);
  const [ramp, setRamp] = useState(0); // display floor ramp 0..1
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hold = window.setTimeout(() => setMinHoldDone(true), MIN_HOLD_MS);
    const ceiling = window.setTimeout(() => setWarmWaived(true), WARM_WAIT_CEILING_MS);
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const r = Math.min(1, (performance.now() - t0) / PROGRESS_RAMP_MS);
      setRamp(r);
      if (r >= 1) window.clearInterval(tick);
    }, 80);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(ceiling);
      window.clearInterval(tick);
    };
  }, []);

  // Shown progress = min(real, ramp): during a real download show real, on a full cache hit still fill evenly instead of an instant 100%
  const shown = Math.min(warm, ramp);
  const ready = dataReady && minHoldDone && (warm >= 1 || warmWaived);
  // Note deps is only ready (monotonic false→true): if leaving were also in deps,
  // the re-run triggered by setLeaving would first clean up the setGone timer then be blocked by the guard — overlay never unmounts
  useEffect(() => {
    if (!ready) return;
    setLeaving(true);
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  // Cross-scrolling columns: catalog split round-robin into columns; each column loops 4 copies of the same stack
  // (a -50% shift = two copies, the other two keep content visible on tall windows through the half-cycle, no gap)
  const columns = useMemo(() => {
    const COLS = 5;
    if (!frames.length) return [];
    const cols: FrameCatalogItem[][] = Array.from({ length: COLS }, () => []);
    frames.forEach((f, i) => cols[i % COLS]!.push(f));
    return cols.filter((c) => c.length > 0);
  }, [frames]);

  if (gone) return null;

  const pct = Math.round(shown * 100);
  const status = shown < 1 && !warmWaived ? t('common.warmingUpCreativeEngine') : dataReady ? t('common.enteringWorkspace') : t('common.syncingProject');

  return (
    <div
      className={`bg-canvas absolute inset-0 z-[120] overflow-hidden rounded-lg transition-opacity ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      aria-busy={!ready}
      aria-label={t('common.enteringWorkspaceNow')}
    >
      {/* Theme card wall (blurred background): blur + slight scale-up to hide edges, columns cross-scroll.
          Before the catalog arrives (first visit, no mirror) scroll skeleton cards — background from the first frame, no blank gap */}
      <div className="absolute inset-0" style={{ filter: 'blur(4px) saturate(1.05)', transform: 'scale(1.04)' }} aria-hidden>
        <div className="flex h-full justify-center gap-4 px-4">
          {(columns.length ? columns : SKELETON_COLUMNS).map((col, i) => (
            <div key={i} className="h-full w-56 shrink-0 overflow-hidden">
              <div
                className="sb-col flex flex-col gap-4"
                style={{
                  animationName: i % 2 === 0 ? 'sb-col-down' : 'sb-col-up',
                  animationDuration: `${46 + i * 9}s`,
                }}
              >
                {[0, 1, 2, 3].flatMap((rep) =>
                  col.map((f, j) => (f ? <ThemeWallCard key={`${rep}-${f.id}`} frame={f} /> : <SkeletonWallCard key={`${rep}-sk-${j}`} />)),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Dim layer: lift the foreground progress up, plus a vignette around the edges */}
      <div className="bg-canvas/45 absolute inset-0" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgb(0 0 0 / 0.25) 100%)' }} aria-hidden />

      {/* Foreground: π outline loading + progress */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <svg viewBox="0 0 100 100" width={56} height={56} className="sb-pi" aria-hidden>
          <PiGlyph stroke="var(--color-ink)" strokeWidth={12} />
        </svg>
        <div className="bg-line h-1 w-56 overflow-hidden rounded-full">
          <div className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-ink-2 text-[12px]">{status}</span>
          <span className="text-ink-4 font-mono text-[11px] tabular-nums">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

/** First-visit skeleton columns (placeholder before the catalog arrives): columns scroll from the first frame, real cards swap in place once the catalog returns. */
const SKELETON_COLUMNS: null[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null));

/** Neutral placeholder card (token colors, correct in both light/dark): same shape as a real card, swapping doesn't shift layout. */
function SkeletonWallCard() {
  return (
    <div className="bg-panel border-line flex shrink-0 flex-col gap-2.5 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-line-2 h-2 w-6 shrink-0 rounded-full" />
        <span className="bg-line-2 h-2.5 w-20 rounded-full" />
      </div>
      <span className="bg-line h-2 w-full rounded-full" />
      <span className="bg-line h-2 w-3/4 rounded-full" />
      <div className="bg-panel-2 flex flex-col gap-1.5 rounded-lg p-2.5">
        <span className="bg-line-2 h-1.5 rounded-full" style={{ width: '58%' }} />
        <span className="bg-line h-1.5 rounded-full" style={{ width: '86%' }} />
        <span className="bg-line h-1.5 rounded-full" style={{ width: '42%' }} />
      </div>
    </div>
  );
}

/** Theme card (pure-CSS mini detail card): straight from the palette — paper/panel/accent/theme radius;
 *  under blur it conveys each theme's color and shape character, not a pixel-level cover reproduction. */
function ThemeWallCard({ frame }: { frame: FrameCatalogItem }) {
  const p = frame.palette ?? {};
  const paper = p.paper ?? '#17181B';
  const fg = p.fg ?? '#E8E8E6';
  const muted = p.muted ?? `${fg}99`;
  const accent = p.accent ?? '#8A8A82';
  const panel = p.panel ?? '#202226';
  const line = p.line ?? `${fg}26`;
  const radius = p.radius ?? '14px';
  return (
    <div className="flex shrink-0 flex-col gap-2.5 p-4" style={{ background: paper, color: fg, borderRadius: radius, boxShadow: p.shadow }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="truncate text-[13px] font-semibold">{frame.title}</span>
      </div>
      <div className="line-clamp-2 text-[10.5px] leading-relaxed" style={{ color: muted }}>
        {frame.summary}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5" style={{ background: panel, borderRadius: `calc(${radius} * 0.6 + 2px)`, border: `1px solid ${line}` }}>
        <span className="h-1.5 rounded-full" style={{ background: accent, width: '58%' }} />
        <span className="h-1.5 rounded-full" style={{ background: line, width: '86%' }} />
        <span className="h-1.5 rounded-full" style={{ background: line, width: '42%' }} />
      </div>
    </div>
  );
}
