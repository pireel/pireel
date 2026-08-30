'use client';

/**
 * Independent cached media-analysis capabilities (transcript and visuals), reused by agent tools.
 *
 * Reads/writes go through refs (a tool running several steps in a row needs the latest, and setState is async);
 * the agent can choose either analysis when the request needs it — the step functions dedupe in flight: a given stage runs once, latecomers
 * share the same promise.
 * report = push friendly copy/progress to the running tool card (setToolProgress wrapped by the caller per tool id).
 */

import { useRef, type MutableRefObject } from 'react';
import {
  applyEditorCommand,
  firstNarrativeAssetId,
  timelineTranscriptionTargets,
  type EditorDocumentV2,
  type EditorMediaAsset,
} from '@pireel/studio-engine/composition';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type VisualTimeline, analyzeVisual } from './visual';
import { t } from './i18n';
import { deleteCachedAsr } from './asr-cache';
import { fileSig } from './media';

export interface MediaAnalysisDeps {
  videoFileRef: MutableRefObject<File | null>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  visualRef: MutableRefObject<VisualTimeline | null>;
  setAsrSentences: (v: AsrSegment[]) => void;
  setVisual: (v: VisualTimeline | null) => void;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2) => void;
  /** Resolve authorized bytes for any placed timeline audio/video asset. */
  speechFileForAsset: (asset: EditorMediaAsset) => Promise<File | null>;
  /** Current video (blob preview URL + canvas size), null when there's no video. */
  currentVideo: () => { url: string; durationSec: number; width: number; height: number } | null;
}

function transcriptWordCount(segments: readonly AsrSegment[]): number {
  return segments.reduce((count, segment) => (
    count + (segment.words?.length ?? Math.max(1, segment.text.trim().split(/\s+|(?=\p{Script=Han})/u).filter(Boolean).length))
  ), 0);
}

export function useMediaAnalysis(deps: MediaAnalysisDeps) {
  const {
    videoFileRef, asrRef, visualRef, setAsrSentences, setVisual, documentRef, setDocument,
    speechFileForAsset, currentVideo,
  } = deps;

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

  /** Extract transcript: ASR only (lib-cached) + store sentences. Does not lay captions,
   * add graphics, or cut shots. Returns sentences. */
  function runAsr(report: ((text: string) => void) | undefined, force: boolean): Promise<AsrSegment[]> {
    return dedup('asr', async () => {
      const current = documentRef.current;
      // Honor the pinned caption/narration source: with the source pinned to the narration track,
      // ASR must not transcribe muted montage footage as if it were the narration script.
      const targets = timelineTranscriptionTargets(current, current.semantics.managedCaptionSource ?? { mode: 'auto' });
      if (!targets.length) {
        const silentAssetIds = [...new Set(current.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
          const assetId = 'assetId' in clip && typeof clip.assetId === 'string' ? clip.assetId : null;
          if (!clip.enabled || !assetId) return [];
          const asset = current.assets[assetId];
          return asset?.kind === 'video' && asset.metadata.hasAudio === false ? [asset.id] : [];
        })))];
        if (!silentAssetIds.length) throw new Error(t('common.uploadVideoFirst'));
        const transcripts = { ...current.semantics.transcripts };
        for (const assetId of silentAssetIds) transcripts[assetId] = [];
        const document = { ...current, semantics: { ...current.semantics, transcripts } };
        if (firstNarrativeAssetId(current) && silentAssetIds.includes(firstNarrativeAssetId(current)!)) {
          asrRef.current = [];
          setAsrSentences([]);
        }
        setDocument(document);
        return [];
      }
      report?.(t('common.transcribing'));
      const firstAssetId = firstNarrativeAssetId(current);
      const transcripts = { ...current.semantics.transcripts };
      let firstError: unknown;
      for (const target of targets) {
        const refreshThisAsset = force;
        if (Object.prototype.hasOwnProperty.call(transcripts, target.assetId) && !refreshThisAsset) continue;
        const asset = current.assets[target.assetId];
        if (!asset) continue;
        try {
          const file = target.assetId === firstAssetId && videoFileRef.current
            ? videoFileRef.current
            : await speechFileForAsset(asset);
          if (!file) continue;
          if (refreshThisAsset) deleteCachedAsr(fileSig(file));
          transcripts[target.assetId] = await studioProviders().transcriber.transcribe(file);
        } catch (error) {
          firstError ??= error;
        }
      }
      const available = targets
        .map((target) => ({ target, segments: transcripts[target.assetId] as AsrSegment[] | undefined }))
        .filter((entry): entry is { target: typeof targets[number]; segments: AsrSegment[] } => !!entry.segments?.length);
      const resolved = targets.filter((target) => Object.prototype.hasOwnProperty.call(transcripts, target.assetId));
      if (!resolved.length) {
        if (firstError instanceof Error) throw firstError;
        throw new Error(t('workbench.restoreVideoSourceBeforeCaptions'));
      }
      // ASR can run for minutes. Merge only transcript results into the latest document so an
      // unrelated timeline edit made while it was running is never rolled back by the completion.
      const latest = documentRef.current;
      const mergedTranscripts = { ...latest.semantics.transcripts };
      for (const target of targets) {
        if (!latest.assets[target.assetId] || !Object.prototype.hasOwnProperty.call(transcripts, target.assetId)) continue;
        mergedTranscripts[target.assetId] = transcripts[target.assetId]!;
      }
      const document = {
        ...latest,
        semantics: { ...latest.semantics, transcripts: mergedTranscripts },
      };
      const latestFirstAssetId = firstNarrativeAssetId(latest);
      const main = latestFirstAssetId
        ? mergedTranscripts[latestFirstAssetId] as AsrSegment[] | undefined
        : undefined;
      if (main?.length) {
        asrRef.current = main;
        setAsrSentences(main);
      }
      setDocument(document);
      return main?.length
        ? main
        : available.sort((left, right) => transcriptWordCount(right.segments) - transcriptWordCount(left.segments))[0]?.segments ?? [];
    });
  }
  function stepAsr(report?: (text: string) => void): Promise<AsrSegment[]> {
    return runAsr(report, false);
  }
  /** Re-transcribe the mounted main source even when a cached transcript exists. Used only after
   *  native caption relay proves the stored transcript cannot produce a cue for the current track. */
  function refreshAsr(report?: (text: string) => void): Promise<AsrSegment[]> {
    return runAsr(report, true);
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
      if (vis.palette && !documentRef.current.appearance.frameId) {
        const command = applyEditorCommand(documentRef.current, { type: 'appearance.patch', patch: { palette: vis.palette } });
        if (command.ok) setDocument(command.document);
      }
    }
    return vis;
  }

  return { stepAsr, refreshAsr, stepVisual };
}
