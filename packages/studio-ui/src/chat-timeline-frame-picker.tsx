'use client';

/** Chat control that arms the existing Studio timeline for exact-frame picking. */

import { useEffect, useRef } from 'react';
import { LoaderCircle, ScanLine } from 'lucide-react';
import { t } from './i18n';

/** Keep enough editor width visible to make the real timeline tappable while frame-pick mode is armed. */
export function shouldCollapseChatForTimelineFramePick(viewportWidth: number, panelWidth: number): boolean {
  return viewportWidth - panelWidth < 360;
}

export function formatTimelineFrameTime(atSec: number, fps: number): string {
  const safeFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(atSec * safeFps));
  const frame = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frame).padStart(2, '0')}`;
  return hours ? `${String(hours).padStart(2, '0')}:${base}` : base;
}

export function ChatTimelineFramePicker({
  disabled,
  available,
  active,
  busy,
  count,
  onActiveChange,
}: {
  disabled: boolean;
  available: boolean;
  active: boolean;
  busy: boolean;
  count: number;
  onActiveChange: (active: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!active) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onActiveChange(false);
      buttonRef.current?.blur();
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [active, onActiveChange]);

  const title = active
    ? t('chatGen.cancelTimelineFramePick')
    : count > 0
      ? t('chatGen.pickAnotherTimelineFrame', { count })
      : t('chatGen.pickTimelineFrame');

  return (
    <button
      ref={buttonRef}
      type="button"
      disabled={disabled || busy || !available}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? 'bg-accent/15 text-accent hover:bg-accent/25' : 'text-ink-3 hover:bg-line hover:text-ink'
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        onActiveChange(!active);
        if (active) event.currentTarget.blur();
      }}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" strokeWidth={2.1} />}
    </button>
  );
}
