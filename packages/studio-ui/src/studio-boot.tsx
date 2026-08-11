'use client';

/**
 * Entry boot layer: won't let you through until both are done —
 *  1. Warm up heavy assets (MODNet 26M + ort wasm 27M + GSAP): streaming fetch into HTTP cache,
 *     real byte-level progress; person matte/preview open instantly when later needed. Failure/404 doesn't block entry (an OSS shell may lack these files).
 *  2. Wait for project data to settle (the cloud-first-then-local auto-restore finishing, passed in via dataReady).
 * Background reuses the empty-canvas dot grid so boot and the first empty frame feel like one continuous surface.
 * Warm-up is module-level, once: switching projects and remounting the workbench doesn't refetch, progress just continues from its completed state.
 */

import { useEffect, useState } from 'react';
import { PiGlyph } from '@pireel/ui/brand-mark';
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

  if (gone) return null;

  const pct = Math.round(shown * 100);
  const status = shown < 1 && !warmWaived ? t('common.warmingUpCreativeEngine') : dataReady ? t('common.enteringWorkspace') : t('common.syncingProject');

  return (
    <div
      className={`bg-canvas absolute inset-0 z-[120] overflow-hidden rounded-lg bg-[radial-gradient(circle_at_center,var(--color-line)_0_1px,transparent_1.5px)] bg-[length:14px_14px] transition-opacity ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      aria-busy={!ready}
      aria-label={t('common.enteringWorkspaceNow')}
    >
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
