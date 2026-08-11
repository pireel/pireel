'use client';

/**
 * Entry boot layer: wait only for project data to settle (the cloud-first-then-local
 * auto-restore finishing, passed in via dataReady).
 *
 * Optional creative assets must not be fetched here. Person matting alone needs roughly
 * 53 MB of model/runtime files and is already loaded by person-matte when the feature is
 * actually used; GSAP follows the same feature-local loading path in block-preview-card.
 * Keeping those assets lazy avoids charging every Studio visit for tools the user may
 * never open.
 *
 * Background reuses the empty-canvas dot grid so boot and the first empty frame feel like
 * one continuous surface.
 */

import { useEffect, useState } from 'react';
import { PiGlyph } from '@pireel/ui/brand-mark';
import { t } from './i18n';

const MIN_HOLD_MS = 1_800; // play the full intro even on a full cache hit (user's call: too fast feels like no experience)
const FADE_MS = 450;
/** Keep the progress movement calm even when project data is already available. */
const PROGRESS_RAMP_MS = 1_400;

/** Entry boot overlay: project-data gate; fades out and self-unmounts when done. */
export function StudioBootOverlay({ dataReady }: { dataReady: boolean }) {
  const [minHoldDone, setMinHoldDone] = useState(false);
  const [ramp, setRamp] = useState(0); // display floor ramp 0..1
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hold = window.setTimeout(() => setMinHoldDone(true), MIN_HOLD_MS);
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const r = Math.min(1, (performance.now() - t0) / PROGRESS_RAMP_MS);
      setRamp(r);
      if (r >= 1) window.clearInterval(tick);
    }, 80);
    return () => {
      window.clearTimeout(hold);
      window.clearInterval(tick);
    };
  }, []);

  // Project loading has no byte-level progress. Hold at 90% until data is ready, then
  // complete; this remains honest without coupling startup to optional asset downloads.
  const shown = dataReady ? ramp : Math.min(0.9, ramp * 0.9);
  const ready = dataReady && minHoldDone;
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
  const status = dataReady ? t('common.enteringWorkspace') : t('common.syncingProject');

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
