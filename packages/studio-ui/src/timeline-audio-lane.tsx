'use client';

/**
 * The music lane — its own component for one reason: it owns the live gesture state.
 *
 * Moving, trimming or fading a clip updates a value on every pointer frame. While that state lived in
 * the timeline, each frame re-rendered the entire timeline — every scene card, every block chip, every
 * waveform — to move one chip a few pixels. Here the same gesture re-renders the lane and nothing else.
 * (The earlier attempt, painting the chip through the DOM during the drag, lost to React over the very
 * same style props; local state in the smallest component that needs it is the version that holds.)
 *
 * Geometry mirrors the reference editor's clip renderer: a label strip on top, everything audio-shaped
 * in the body below it, and the fade knees in their own lane inside the body rather than on the corner.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { Music, VolumeX } from 'lucide-react';
import {
  AUDIO_FADE_MAX_SEC,
  type AudioClip,
  audioClipDefaults,
  audioClipWindow,
  audioTrimPatch,
} from '@pireel/studio-engine/composition';
import { AUDIO_ROW_H } from './timeline-utils';
import { fadeBodyPath, waveBars } from './timeline-wave';
import { t } from './i18n';

/* ---- Audio chip geometry (mirrors the reference editor's ClipRenderer) ---- */
/** Chip height inside the music lane (row height minus the 2px breathing room top and bottom). */
const CHIP_H = AUDIO_ROW_H - 4;
/** Label strip across the top; the waveform, fade wedge and knees all live in the BODY below it. */
const CHIP_LABEL_H = 14;
const CHIP_BODY_H = CHIP_H - CHIP_LABEL_H;
/** Knees sit in a fixed "fade lane" a few px below the body's top edge — not on the chip's corner. */
const KNEE_LANE_Y = 4;
const KNEE_SIZE = 10;
/** Knees stay this far inside the clip so they never hide under the trim handles or get clipped. */
const KNEE_EDGE_INSET = 10;

/** The clip's ENTIRE media as one path, drawn in peak-index coordinates rather than pixels: the svg's
 *  viewBox stretches it to whatever width the zoom asks for, so this string survives zooming, trimming and
 *  moving untouched. Only the peaks themselves and the clip's level change it — a trim changes which part
 *  of it is visible, which is a crop, not a redraw. Resolution is capped generously because this is built
 *  once per clip, not per frame. */
const WAVE_UNITS_MAX = 4000;
function clipWavePath(peaks: Float32Array, volumeDb: number): string {
  return waveBars(peaks, 0, peaks.length, peaks.length, CHIP_BODY_H, volumeDb, undefined, WAVE_UNITS_MAX);
}

/** Where a fade knob sits horizontally (body px), clamped so it stays grabbable inside the clip. */
function audioKneeX(fadeSec: number, edge: 'in' | 'out', widthPx: number, spanSec: number): number {
  const raw = (Math.max(0, fadeSec) / Math.max(0.05, spanSec)) * widthPx;
  const inset = Math.min(KNEE_EDGE_INSET, Math.max(0, widthPx / 2));
  const at = edge === 'in' ? raw : widthPx - raw;
  return Math.min(widthPx - inset, Math.max(inset, at));
}


export interface AudioLaneProps {
  clips: AudioClip[];
  /** Timeline duration (s) and scale (px per second). */
  dur: number;
  pps: number;
  /** Row offset inside the track area. */
  top: number;
  /** Peak envelopes per clip sig; absent = bytes not mounted, the chip draws label-only. */
  peaks?: Map<string, Float32Array>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, startSec: number) => void;
  onTrim?: (id: string, patch: { startSec?: number; inSec?: number; outSec?: number }) => void;
  onFade?: (id: string, edge: 'in' | 'out', sec: number) => void;
  onOpenPanel?: () => void;
  /** Pointer x → edited seconds, and the snap pass, both owned by the timeline (they need its scroll box). */
  secAt: (clientX: number) => number;
  snap: (sec: number, exclude?: number[]) => number;
  /** The timeline's drag shell: pointer capture + rAF coalescing + edge auto-scroll. */
  drag: (e: React.PointerEvent, onMove: (clientX: number, clientY: number) => void, onUp?: (moved: boolean) => void) => void;
}

function AudioLaneImpl({ clips, dur, pps, top, peaks, selectedId, onSelect, onMove, onTrim, onFade, onOpenPanel, secAt, snap, drag }: AudioLaneProps) {
  /** Live gesture value (this component's whole reason to exist): the clip under the pointer renders
   *  from base + patch, and the commit lands once on release. */
  const [audioDrag, setAudioDrag] = useState<{ id: string; patch: Partial<AudioClip> } | null>(null);
  const px = useCallback((s: number) => s * pps, [pps]);
  /** One static path per clip, rebuilt only when its peaks or its level change. */
  const waves = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of clips) {
      const p = c.sig ? peaks?.get(c.sig) : undefined;
      if (p && p.length > 1) out.set(c.id, clipWavePath(p, audioClipDefaults(c).volumeDb));
    }
    return out;
  }, [clips, peaks]);
  return (
    <div className="absolute right-0 left-0" style={{ top, height: AUDIO_ROW_H }}>
      {clips.map((base) => {
        // during a gesture this clip renders from the live patch; everything below (window,
        // wave slice, fades, knee positions) derives from it, so there is one source of truth
        const clip = audioDrag?.id === base.id ? { ...base, ...audioDrag.patch } : base;
        const w = audioClipWindow(clip, dur);
        const end = Math.min(dur, w.end);
        const contentW = px(Math.max(0.05, w.end - w.start)); // the clip's real length in px
        const width = Math.max(14, px(Math.max(0.05, end - w.start))); // visible box (clipped at the timeline end)
        const selected = selectedId === clip.id;
        const d = audioClipDefaults(clip);
        const span = Math.max(0.05, w.end - w.start);
        const knobs = width > 56; // narrow chips have no room for knees (drag the panel sliders instead)
        // The wave is drawn ONCE for the whole media and then cropped: the svg spans the full source at the
        // current zoom, sits at a negative offset for the in-point, and the chip's overflow hides the rest.
        // Trimming therefore moves three numbers — no path is rebuilt, which is the whole point of drawing
        // it in media coordinates. (Unknown media length = nothing to crop; fall back to the visible box.)
        const wave = waves.get(base.id);
        const mediaSec = clip.durationSec != null ? clip.durationSec / d.speed : null;
        const fullW = mediaSec != null ? px(mediaSec) : contentW;
        const offsetPx = mediaSec != null ? px(d.inSec / d.speed) : 0;
        // Fade silhouette lives in the same viewBox space as the wave (peak indices when there is a wave,
        // pixels otherwise), and it IS small — a dozen points per ramp — so rebuilding it per frame is free.
        const units = wave ? (peaks?.get(clip.sig ?? '')?.length ?? contentW) : fullW;
        const uPerPx = units / Math.max(1, fullW);
        const silhouette = fadeBodyPath(contentW * uPerPx, CHIP_BODY_H, d.fadeInSec, d.fadeOutSec, span);
        const maskId = `audfade-${clip.id}`;
        // A gesture renders from local state and commits ONCE on release: writing comp per pointer frame
        // re-rendered the whole workbench and re-specced the audio engine (that was the stutter), while
        // painting the chip through the DOM fought React for the same left/width props (that was the "not
        // live"). Direct-manipulation drags stay out of the undo stack (element-track convention).
        return (
          <div
            key={clip.id}
            role="button"
            tabIndex={0}
            title={clip.label || t('panels.musicBed')}
            className={`group/aud text-ink absolute top-0.5 cursor-grab overflow-hidden rounded-md border active:cursor-grabbing ${
              selected ? 'border-accent ring-accent/40 z-10 ring-1' : 'border-accent/40'
            }`}
            style={{ left: px(w.start), width, height: CHIP_H }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSelect?.(clip.id);
                onOpenPanel?.();
              }
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              const grab = secAt(e.clientX) - w.start;
              let at = w.start;
              drag(
                e,
                (cx) => {
                  let ns = Math.max(0, Math.min(Math.max(0, dur - 0.2), snap(secAt(cx) - grab, [w.start, w.end])));
                  if (ns < 0.15) ns = 0; // snap to the head
                  at = ns;
                  setAudioDrag({ id: base.id, patch: { startSec: ns } });
                },
                (moved) => {
                  setAudioDrag(null);
                  onSelect?.(base.id);
                  if (moved) onMove?.(base.id, at);
                  else onOpenPanel?.();
                },
              );
            }}
          >
            {/* Label strip on top; everything audio-shaped lives in the BODY below it — the same
                split the reference editor uses, which is why its knees sit in a lane instead of on
                the chip's corner. */}
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 px-1.5 ${selected ? 'bg-accent/18' : 'bg-accent/10'}`}
              style={{ height: CHIP_LABEL_H }}
            >
              {clip.muted ? <VolumeX size={9} className="text-ink-4 shrink-0" /> : <Music size={9} className="text-accent shrink-0" />}
              <span className={`truncate text-[9.5px] leading-none ${clip.muted ? 'text-ink-4 line-through' : 'text-ink-2'}`}>{clip.label || t('panels.musicBed')}</span>
              {d.speed !== 1 && (
                <span className="text-ink-3 bg-panel/70 shrink-0 rounded px-1 text-[9px] leading-[12px] tabular-nums">{d.speed.toFixed(2).replace(/0$/, '')}×</span>
              )}
            </div>
            {/* Body: the full media at the current zoom, slid left by the in-point so the chip's overflow
                crops it. The fade shapes the wave by CLIPPING it to the tapered silhouette — same edge the
                gain follows — instead of being baked into the bar heights, so the bars stay static. */}
            <svg
              className="pointer-events-none absolute"
              style={{ top: CHIP_LABEL_H, left: -offsetPx, width: fullW, height: CHIP_BODY_H }}
              viewBox={`0 0 ${Math.round(units)} ${CHIP_BODY_H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <clipPath id={maskId}>
                  <path d={silhouette} transform={`translate(${(offsetPx * uPerPx).toFixed(2)},0)`} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${maskId})`}>
                {/* body background (the silhouette itself), then the wave on top of it */}
                <path d={silhouette} transform={`translate(${(offsetPx * uPerPx).toFixed(2)},0)`} className={selected ? 'text-accent/18' : 'text-accent/10'} fill="currentColor" />
                {/* Muted keeps its shape but loses its colour — the clip is still there to reason about, it just makes no sound */}
                {wave && <path d={wave} className={clip.muted ? 'text-ink-4/40' : 'text-accent/60'} fill="currentColor" />}
              </g>
            </svg>
            {/* Trim handles: the edge follows the pointer 1:1, painted through the DOM. On a left
                trim the wave is nudged the other way so the audio stays pinned to the timeline —
                dragging reveals or hides it, it never slides. */}
            {(['left', 'right'] as const).map((edge) => (
              <span
                key={edge}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  let patch = audioTrimPatch(base, edge, edge === 'left' ? w.start : w.end);
                  drag(
                    e,
                    (cx) => {
                      // always measured off the ORIGINAL clip, so the edge tracks the pointer
                      // without accumulating rounding from the live preview
                      patch = audioTrimPatch(base, edge, Math.max(0, snap(secAt(cx), [w.start, w.end])));
                      setAudioDrag({ id: base.id, patch });
                    },
                    (moved) => {
                      setAudioDrag(null);
                      onSelect?.(base.id);
                      if (moved) onTrim?.(base.id, patch);
                    },
                  );
                }}
                className={`absolute inset-y-0 w-1.5 cursor-ew-resize ${edge === 'left' ? 'left-0 rounded-l' : 'right-0 rounded-r'} ${
                  selected ? 'bg-white/50' : 'bg-white/0 group-hover/aud:bg-white/40'
                }`}
              />
            ))}
            {/* Fade knees: small squares in the fade lane, sitting on the ramp's top vertex, with a
                diagonal glyph pointing the way the ramp runs. The wedge is always drawn — only the
                grabs are hover/selected (14px hit area around an 8px glyph). */}
            {knobs &&
              (['in', 'out'] as const).map((edge) => {
                const kx = audioKneeX(edge === 'in' ? d.fadeInSec : d.fadeOutSec, edge, contentW, span);
                return (
                  <span
                    key={edge}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      let sec = edge === 'in' ? d.fadeInSec : d.fadeOutSec;
                      drag(
                        e,
                        (cx) => {
                          const raw = edge === 'in' ? secAt(cx) - w.start : w.end - secAt(cx);
                          sec = Math.round(Math.max(0, Math.min(span, AUDIO_FADE_MAX_SEC, raw)) * 10) / 10;
                          setAudioDrag({ id: base.id, patch: edge === 'in' ? { fadeInSec: sec } : { fadeOutSec: sec } });
                        },
                        (moved) => {
                          setAudioDrag(null);
                          onSelect?.(base.id);
                          if (moved) onFade?.(base.id, edge, sec);
                        },
                      );
                    }}
                    title={t(edge === 'in' ? 'panels.fadeIn' : 'panels.fadeOut')}
                    className={`absolute z-10 flex cursor-ew-resize items-center justify-center transition-opacity ${selected ? '' : 'opacity-0 group-hover/aud:opacity-100'}`}
                    style={{ left: kx - 7, top: CHIP_LABEL_H + KNEE_LANE_Y - 7, width: 14, height: 14 }}
                  >
                    <span
                      className="border-accent block rounded-full border-2 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                      style={{ width: KNEE_SIZE, height: KNEE_SIZE }}
                    />
                  </span>
                );
              })}
          </div>
        );
      })}
      {clips.length === 0 && (
        <div className="border-accent/50 text-accent absolute inset-x-0 top-0.5 bottom-0.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed text-[10px]">
          <Music size={11} /> {t('panels.dropAudioHere')}
        </div>
      )}
    </div>
  );
}

export const AudioLane = memo(AudioLaneImpl);
