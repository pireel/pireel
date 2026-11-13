/**
 * An audio clip's chip on the canvas timeline: a label strip over a body that carries the wave,
 * tapered by its fades, with a knee per fade and a mute switch. One geometry for the painter and
 * for the pointer, so what is drawn is what a press lands on.
 */
import { type AudioClip, audioClipDefaults, audioClipWindow, fadeShape } from '@pireel/studio-engine/composition';

export const CHIP_LABEL_H = 14;
/** The knees sit in a lane a few px under the body's top edge, not on the chip's corner. */
const KNEE_LANE_Y = 4;
export const KNEE_RADIUS = 5;
const KNEE_GRAB = 7;
/** Knees stay this far inside the clip, clear of the trim handles. */
const KNEE_EDGE_INSET = 10;
const TRIM_GRAB = 6;
export const MUTE_BUTTON = { size: 12, top: 2, right: 4 };

export interface AudioChip {
  /** Content px of the clip's start, and its real length in px. */
  left: number;
  contentWidth: number;
  /** The box drawn: at least wide enough to grab, and no further than the lanes go. */
  width: number;
  spanSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  /** Knee centres in px from the chip's left; null on a chip too narrow to hold them. */
  knees: { in: number; out: number } | null;
  /** The mute switch has room. */
  muteButton: boolean;
}

function kneeX(fadeSec: number, edge: 'in' | 'out', widthPx: number, spanSec: number): number {
  const raw = (Math.max(0, fadeSec) / Math.max(0.05, spanSec)) * widthPx;
  const inset = Math.min(KNEE_EDGE_INSET, Math.max(0, widthPx / 2));
  const at = edge === 'in' ? raw : widthPx - raw;
  return Math.min(widthPx - inset, Math.max(inset, at));
}

export function audioChip(clip: AudioClip, durationSec: number, pps: number, surfaceEndSec: number): AudioChip {
  const window = audioClipWindow(clip, durationSec);
  const defaults = audioClipDefaults(clip);
  const spanSec = Math.max(0.05, window.end - window.start);
  const contentWidth = spanSec * pps;
  const width = Math.max(14, Math.max(0.05, Math.min(surfaceEndSec, window.end) - window.start) * pps);
  return {
    left: window.start * pps, contentWidth, width, spanSec, fadeInSec: defaults.fadeInSec, fadeOutSec: defaults.fadeOutSec,
    knees: width > 56 ? { in: kneeX(defaults.fadeInSec, 'in', contentWidth, spanSec), out: kneeX(defaults.fadeOutSec, 'out', contentWidth, spanSec) } : null,
    muteButton: width >= 34,
  };
}

export const kneeY = (chipTop: number) => chipTop + CHIP_LABEL_H + KNEE_LANE_Y;

export type AudioZone = 'mute' | 'fade-in' | 'fade-out' | 'left' | 'right' | 'body';

/** What a press at a point of the chip does: its controls first, as they lie over the body. */
export function audioZoneAt(chip: AudioChip, chipTop: number, contentX: number, y: number, can: { mute: boolean; fade: boolean; trim: boolean }): AudioZone {
  const x = contentX - chip.left;
  if (can.mute && chip.muteButton && x >= chip.width - MUTE_BUTTON.right - MUTE_BUTTON.size - 2 && x <= chip.width - MUTE_BUTTON.right + 2 && y >= chipTop && y <= chipTop + MUTE_BUTTON.top + MUTE_BUTTON.size + 2) return 'mute';
  if (can.fade && chip.knees && Math.abs(y - kneeY(chipTop)) <= KNEE_GRAB) {
    // Where both knees are in reach (a short clip, no fades yet), the nearer one is taken.
    const toIn = Math.abs(x - chip.knees.in);
    const toOut = Math.abs(x - chip.knees.out);
    if (Math.min(toIn, toOut) <= KNEE_GRAB) return toIn <= toOut ? 'fade-in' : 'fade-out';
  }
  if (can.trim) {
    if (x >= chip.width - TRIM_GRAB) return 'right';
    if (x <= TRIM_GRAB) return 'left';
  }
  return 'body';
}

/** The body's outline with its fades: flat-topped, rising over the fade in and falling over the fade out. */
export function fadeOutline(ctx: CanvasRenderingContext2D, chip: AudioChip, x: number, top: number, height: number): void {
  const STEPS = 12;
  const width = chip.contentWidth;
  const fadeIn = chip.fadeInSec > 0 ? Math.min(width, (chip.fadeInSec / chip.spanSec) * width) : 0;
  const fadeOut = chip.fadeOutSec > 0 ? (chip.fadeOutSec / chip.spanSec) * width : 0;
  ctx.beginPath();
  ctx.moveTo(x, top + height);
  if (fadeIn > 0) for (let step = 1; step <= STEPS; step += 1) ctx.lineTo(x + (fadeIn * step) / STEPS, top + height - fadeShape(step / STEPS) * height);
  else ctx.lineTo(x, top);
  const fallFrom = Math.max(0, width - fadeOut);
  ctx.lineTo(x + fallFrom, top);
  if (fadeOut > 0) for (let step = 1; step <= STEPS; step += 1) ctx.lineTo(x + fallFrom + ((width - fallFrom) * step) / STEPS, top + height - fadeShape(1 - step / STEPS) * height);
  else ctx.lineTo(x + width, top);
  ctx.lineTo(x + width, top + height);
  ctx.closePath();
}
