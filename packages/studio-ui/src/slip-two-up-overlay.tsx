'use client';

/**
 * Slip two-up over the preview stage: while a slip drag is active, show the slid window's NEW
 * first and last frame side by side. Frames are plain <video> elements seeked to the target
 * times — rapid currentTime writes re-target the in-flight seek, so pointer-speed updates
 * coalesce natively; no per-move extraction pipeline. Display only, never interactive.
 */

import { useEffect, useRef } from 'react';
import { t } from './i18n';

const seekTo = (video: HTMLVideoElement | null, sec: number) => {
  if (!video || !Number.isFinite(sec)) return;
  const target = Math.max(0, sec);
  if (Math.abs(video.currentTime - target) > 0.01) video.currentTime = target;
};

export function SlipTwoUpOverlay({
  source,
  startSec,
  endSec,
}: {
  source: string;
  startSec: number;
  endSec: number;
}) {
  const startRef = useRef<HTMLVideoElement | null>(null);
  const endRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    seekTo(startRef.current, startSec + 0.01);
    // Nudge inside the window so "last frame" never samples the first frame of the next cut.
    seekTo(endRef.current, endSec - 0.05);
  }, [startSec, endSec]);
  const pane = (
    ref: React.MutableRefObject<HTMLVideoElement | null>,
    label: string,
    sec: number,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <video
        ref={ref}
        src={source}
        muted
        playsInline
        preload="auto"
        className="max-h-full min-h-0 w-full rounded object-contain"
      />
      <span className="shrink-0 rounded bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white/90">
        {`${label} · ${sec.toFixed(2)}s`}
      </span>
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-stretch justify-center gap-3 bg-black/70 p-4">
      {pane(startRef, t('panels.slipFirstFrame'), startSec)}
      {pane(endRef, t('panels.slipLastFrame'), endSec)}
    </div>
  );
}
