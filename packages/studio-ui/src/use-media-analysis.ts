'use client';

/**
 * Independent cached media-analysis capabilities (transcript and visuals), reused by agent tools.
 *
 * Reads/writes go through refs (a tool running several steps in a row needs the latest, and setState is async);
 * the agent can choose either analysis when the request needs it — the step functions dedupe in flight: a given stage runs once, latecomers
 * share the same promise.
 * report = push friendly copy/progress to the running tool card (setToolProgress wrapped by the caller per tool id).
 */

import { useRef, type MutableRefObject, type SetStateAction } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type VisualTimeline, analyzeVisual } from './visual';
import { t } from './i18n';

export interface MediaAnalysisDeps {
  videoFileRef: MutableRefObject<File | null>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  setAsrSentences: (v: AsrSegment[]) => void;
  setVisual: (v: VisualTimeline | null) => void;
  setComp: (action: SetStateAction<Composition>) => void;
  /** Current video (blob preview URL + canvas size), null when there's no video. */
  currentVideo: () => { url: string; durationSec: number; width: number; height: number } | null;
}

export function useMediaAnalysis(deps: MediaAnalysisDeps) {
  const { videoFileRef, asrRef, visualRef, setAsrSentences, setVisual, setComp, currentVideo } = deps;

  const inflightRef = useRef<{ asr?: Promise<AsrSegment[]>; visual?: Promise<VisualTimeline | null> }>({});
  function dedup<K extends 'asr' | 'visual', T>(key: K, run: () => Promise<T>): Promise<T> {
    const inflight = inflightRef.current[key] as Promise<T> | undefined;
    if (inflight) return inflight;
    const p = run().finally(() => {
      inflightRef.current[key] = undefined;
    });
    (inflightRef.current as Record<string, unknown>)[key] = p;
    return p;
  }

  /** Extract transcript: ASR only (lib-cached) + store sentences. Does not lay captions, create a storyboard,
   *  add graphics, or cut shots. Returns sentences. */
  function stepAsr(report?: (text: string) => void): Promise<AsrSegment[]> {
    if (asrRef.current?.length) return Promise.resolve(asrRef.current);
    return dedup('asr', async () => {
      const vf = videoFileRef.current;
      if (!vf) throw new Error(t('common.uploadVideoFirst'));
      report?.(t('common.transcribing'));
      const segs = await studioProviders().transcriber.transcribe(vf);
      asrRef.current = segs;
      setAsrSentences(segs);
      return segs;
    });
  }

  /** Analyze visuals: local frame-by-frame (MediaPipe safe area + VLM). Extrapolate ETA from measured rate for progress. Returns null on failure. */
  function stepVisual(report?: (text: string, frac?: number) => void): Promise<VisualTimeline | null> {
    if (visualRef.current) return Promise.resolve(visualRef.current);
    return dedup('visual', () => stepVisualInner(report));
  }
  async function stepVisualInner(report?: (text: string, frac?: number) => void): Promise<VisualTimeline | null> {
    const vf = videoFileRef.current;
    const v = currentVideo();
    if (!vf || !v) return null;
    // Total frames = min(180, duration×2fps); seed the initial estimate at a calibrated ~0.13s/frame, then refresh with measured rate
    const total = Math.min(180, Math.max(1, Math.floor(v.durationSec * 2)));
    const start = performance.now();
    report?.(t('common.analyzingVisualsAboutSec', { sec: Math.max(2, Math.ceil(total * 0.13)) }), 0);
    // The progress fraction comes only from the MediaPipe geometry pass; VLM semantics/palette run in parallel
    // with no per-frame progress → scale geometry to 85%, and when geometry finishes switch to "semantic analysis"
    // copy pinned at 90%, so we never report 100% while still running (the card shows "finishing up" for the tail).
    const vis = await analyzeVisual(vf, v.durationSec, (done, tot) => {
      const g = tot > 0 ? done / tot : 0;
      if (g >= 1) {
        report?.(t('common.analyzingVisualSemanticsColor'), 0.9);
        return;
      }
      const frac = g * 0.85;
      const elapsed = (performance.now() - start) / 1000;
      const eta = (g > 0.06 ? elapsed / g - elapsed : total * 0.13 - elapsed) + 2; // +2s headroom for the semantic pass
      report?.(t('common.analyzingVisualsPctSec', { pct: Math.round(frac * 100), sec: Math.max(1, Math.ceil(eta)) }), frac);
    }).catch(() => null);
    if (vis) {
      visualRef.current = vis;
      setVisual(vis);
      // Attach the palette derived from the background to the composition → assembleHtml injects #root, compose passes it to the LLM (light blend).
      // Don't override when a frame (frameId) is mounted: a frame is the user's explicitly chosen design system; the visual-derived palette is only a default source
      if (vis.palette) setComp((c) => (c.frameId ? c : { ...c, palette: vis.palette }));
    }
    return vis;
  }

  return { stepAsr, stepVisual };
}
