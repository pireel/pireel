'use client';

/**
 * Three pipeline steps (extract transcript / analyze transcript→plan / analyze visuals), reused by agent tools.
 *
 * Reads/writes go through refs (a tool running several steps in a row needs the latest, and setState is async);
 * the agent can call multiple tools in parallel within one step (analyze transcript ‖ analyze visuals, each its
 * own card with its own progress) — the step functions dedupe in flight: a given stage runs once, latecomers
 * share the same promise.
 * report = push friendly copy/progress to the running tool card (setToolProgress wrapped by the caller per tool id).
 */

import { useRef, type MutableRefObject } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import type { DraftPlan, PlanInsert } from '@pireel/studio-engine/plan';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type VisualTimeline, analyzeVisual } from './visual';
import { t } from './i18n';

export interface DraftPipelineDeps {
  videoFileRef: MutableRefObject<File | null>;
  compRef: MutableRefObject<Composition>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  planRef: MutableRefObject<DraftPlan | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  setAsrSentences: (v: AsrSegment[]) => void;
  setPlan: (v: DraftPlan) => void;
  setVisual: (v: VisualTimeline | null) => void;
  setComp: (updater: (c: Composition) => Composition) => void;
  /** Current video (blob preview URL + canvas size), null when there's no video. */
  currentVideo: () => { url: string; durationSec: number; width: number; height: number } | null;
  /** Planning context for inserted clips (multi-source main track): transcribe on demand to give anchor/duration/content.
   *  Returns [] when there are no inserts; omitted = don't pass them (planning treats them as nonexistent and b-roll gets messy — been bitten). */
  getInsertedClips?: () => Promise<PlanInsert[]>;
}

export function useDraftPipeline(deps: DraftPipelineDeps) {
  const { videoFileRef, compRef, asrRef, planRef, visualRef, setAsrSentences, setPlan, setVisual, setComp, currentVideo } = deps;

  const inflightRef = useRef<{ asr?: Promise<AsrSegment[]>; plan?: Promise<DraftPlan>; visual?: Promise<VisualTimeline | null> }>({});
  function dedup<K extends 'asr' | 'plan' | 'visual', T>(key: K, run: () => Promise<T>): Promise<T> {
    const inflight = inflightRef.current[key] as Promise<T> | undefined;
    if (inflight) return inflight;
    const p = run().finally(() => {
      inflightRef.current[key] = undefined;
    });
    (inflightRef.current as Record<string, unknown>)[key] = p;
    return p;
  }

  /** Extract transcript: ASR only (lib-cached) + store sentences. Does not lay captions or cut shots (captions off
   *  by default, graphics-first; shot structure is built by lay_out per scene). Returns sentences. */
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

  /** Analyze transcript: plan the whole cut. Needs sentences (extract first if absent).
   *  Visual hints are use-if-present: if visual analysis is done, attach it per sentence (no b-roll on screen recordings / framing direction); if not, don't wait. */
  function stepPlan(report?: (text: string) => void): Promise<DraftPlan> {
    if (planRef.current) return Promise.resolve(planRef.current);
    return dedup('plan', () => stepPlanInner(report));
  }
  async function stepPlanInner(report?: (text: string) => void): Promise<DraftPlan> {
    const segs = asrRef.current?.length ? asrRef.current : await stepAsr(report);
    const v = currentVideo();
    const vis = visualRef.current;
    const visuals = vis?.segments.length
      ? segs.map((s, i) => {
          const mid = (s.start + s.end) / 2;
          const seg = vis.segments.find((x) => mid >= x.start - 0.01 && mid < x.end + 0.01) ?? vis.segments.at(-1)!;
          return { index: i, content: seg.label.content, safe: seg.label.safe };
        })
      : null;
    // Inserted-clip context: transcribe on demand then fetch (failure doesn't block planning — better less context than a broken chain)
    const inserts = await (deps.getInsertedClips?.().catch(() => [] as PlanInsert[]) ?? Promise.resolve([] as PlanInsert[]));
    report?.(t('common.analyzingTranscript'));
    const planResp = await studioProviders().planner.plan({
      sentences: segs.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
      videoDurationSec: v?.durationSec ?? 0,
      canvas: { width: compRef.current.width, height: compRef.current.height },
      theme: compRef.current.theme,
      ...(visuals ? { visuals } : {}),
      ...(inserts.length ? { inserts } : {}),
    });
    // Never cache an empty plan (model output parsed no scenes) — caching it would leave shots stuck without placeholders and b-roll forever complaining "cut shots first"
    if (!planResp.scenes?.length) throw new Error(t('common.planningProducedNoScenes'));
    planRef.current = planResp;
    setPlan(planResp);
    return planResp;
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

  return { stepAsr, stepPlan, stepVisual };
}
