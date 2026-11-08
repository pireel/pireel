'use client';

/**
 * Export the finished video: dialog options (resolution/fps/format) → **client-side compositing** →
 * auto download.
 *
 * - **Client-side compositing only** (zero local upload, frame-exact with the preview, full insert-clip/
 *   framing coverage). No WebCodecs or missing local video → honest error (no longer silently handed to
 *   server render — after canvas-ization it produced an all-black video track, was never validated, deprecated).
 * - Result cache: comp + source fingerprint + export options all unchanged → don't re-composite, just re-download the last result.
 */

import { useRef, useState, type MutableRefObject } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Composition,
  type EditorDocumentV2,
  type EditorMediaAsset,
  editorDocumentRenderPlan,
  videoTrackShots,
} from '@pireel/studio-engine/composition';
import { fileSig } from '@pireel/studio-ui/media-ai';
import { ExportCanceled, type ExportRenderOpts, clientExportVideo, measureExportLoudness } from '@pireel/studio-ui/client-export';
import { t, tEnglish } from '@pireel/studio-ui/i18n';
import { compositionRenderView } from '@pireel/studio-ui/composition-render-view';
import { primaryNarrativeRenderPlan } from '@pireel/studio-ui/primary-render-plan';
import { supplementalVisualMedia } from '@pireel/studio-ui/visual-render-plan';
import type { AudioExportEntry } from '@pireel/studio-ui/audio-export-payload';
import { clipAudioMasks, exportAudioMasks } from '@pireel/studio-ui/export-word-masks';


/** Trigger a browser download (blob stays in the cache ref; the URL is revoked once done). */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Save a file from another origin (a CDN): `<a download>` is ignored across origins and only opens
 * the file, so it is fetched and saved from memory; when it cannot be read, it opens in a new tab.
 */
export async function downloadUrl(url: string, name: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    downloadBlob(await response.blob(), name);
  } catch { window.open(url, '_blank', 'noopener'); }
}
/** A download name from a file's URL, falling back to `fallback` with the URL's extension. */
export function downloadName(url: string, fallback: string) {
  const last = decodeURIComponent(new URL(url, 'https://x').pathname.split('/').pop() ?? '');
  const extension = /\.[a-z0-9]{2,5}$/i.exec(last)?.[0] ?? '';
  return `${fallback}${extension}`;
}

export interface ExportDelivery {
  delivered: 'local_sink' | 'browser_download';
  /** Set when a sink was requested but the PUT failed (delivery fell back to the browser download). */
  sinkError?: string;
}

/** Hand the finished blob over: to the local sink when one was requested (agent-driven
 *  headless browsers discard page downloads, so the sink is the reliable path there),
 *  otherwise — or when the sink PUT fails — via the browser download. */
async function deliverBlob(blob: Blob, name: string, sinkUrl?: string): Promise<ExportDelivery> {
  if (sinkUrl) {
    try {
      const r = await fetch(sinkUrl, {
        method: 'PUT',
        headers: { 'content-type': blob.type || 'video/mp4', 'x-pireel-filename': encodeURIComponent(name) },
        body: blob,
      });
      if (r.ok) return { delivered: 'local_sink' };
      throw new Error(`sink responded HTTP ${r.status}`);
    } catch (e) {
      downloadBlob(blob, name);
      return { delivered: 'browser_download', sinkError: e instanceof Error ? e.message : String(e) };
    }
  }
  downloadBlob(blob, name);
  return { delivered: 'browser_download' };
}

const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, '');
/** The file is named after the version it came from, so a batch of versions can be told apart. */
const filenameFor = (o: ExportRenderOpts, title?: string) => {
  const name = [...(title ?? '')].map((char) => (char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '-' : char)).join('').replace(/-+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60);
  return name
    ? t('common.exportFilenameTitled', { title: name, res: o.res, stamp: stamp(), format: o.format })
    : t('common.exportFilename', { res: o.res, stamp: stamp(), format: o.format });
};

export function useStudioExport(deps: {
  compRef: MutableRefObject<Composition>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  resolveAssetUrl: (asset: EditorMediaAsset) => string | null | undefined;
  videoFileRef: MutableRefObject<File | null>;
  /** Local insert-clip File table (key = blob URL); used by client compositing to fetch insert clips. */
  clipFilesRef?: MutableRefObject<Map<string, File>>;
  /** Audio-clip payload getter. It resolves every audible track to bytes before compositing. */
  audioExportRef?: MutableRefObject<(() => Promise<AudioExportEntry[] | null>) | null>;
  /** Denoise substitution getter (source key → baked blended audio); null = original audio. */
  denoiseExportRef?: MutableRefObject<(() => Map<string, File> | null) | null>;
  /** Make every local asset the document references resolvable before the render plan is read.
   *  Right after an output switch the runtime is still restoring sources asynchronously; exporting
   *  before that finishes silently drops the clips whose source is not ready yet (a PIP video). */
  prepareExportAssets?: (document: EditorDocumentV2) => Promise<void>;
  /** The active version's title, read when an export starts. */
  outputTitle?: () => string | undefined;
}) {
  const { compRef, documentRef, resolveAssetUrl, videoFileRef, clipFilesRef, audioExportRef, denoiseExportRef, prepareExportAssets, outputTitle } = deps;
  const [exporting, setExporting] = useState(false);
  /** Synchronous busy flag: the state above only updates on the next render, and preparing assets
   *  awaits before it is set, so a second click could otherwise start a second export. */
  const busyRef = useRef(false);
  const [exportPct, setExportPct] = useState(0);
  const exportCancelRef = useRef(false); // User clicked "Cancel export": stop compositing and unlock the UI
  /** Last-result cache: key = comp + source fingerprint + options. Unchanged → re-download/publish directly, don't re-composite. */
  const lastExportRef = useRef<{ key: string; blob?: Blob; opts: ExportRenderOpts } | null>(null);

  /** Canonical document + runtime source fingerprints + options. Runtime URLs stay outside V2
   *  persistence, so they are included separately to invalidate a cached export after asset recovery. */
  const exportKey = (
    document: EditorDocumentV2,
    plan: ReturnType<typeof editorDocumentRenderPlan>,
    opts: ExportRenderOpts,
    audio: AudioExportEntry[] | null,
  ): string => {
    const resolvedSources = plan.tracks.flatMap((track) => track.clips.flatMap((entry) => (
      entry.resolvedSource ? [[entry.clipId, entry.resolvedSource]] : []
    )));
    const audioFiles = audio?.map((entry) => [entry.clip.id, fileSig(entry.file)]) ?? [];
    return `${videoFileRef.current ? fileSig(videoFileRef.current) : ''}|${JSON.stringify(audioFiles)}|${JSON.stringify(opts)}|${JSON.stringify(document)}|${JSON.stringify(resolvedSources)}`;
  };

  /** WebCodecs is always required; main-source bytes are required only when a surviving clip
   *  actually references that source. Clips-only and graphics/audio-only documents need no main file. */
  const needsMainSource = (c: Composition, plan: ReturnType<typeof editorDocumentRenderPlan>) => {
    const placedIds = new Set(primaryNarrativeRenderPlan(plan).activeEntries.map((entry) => entry.clipId));
    return videoTrackShots(c).some((shot) => placedIds.has(shot.id) && !shot.src);
  };
  const canClientExport = (c: Composition, plan: ReturnType<typeof editorDocumentRenderPlan>) =>
    typeof window !== 'undefined' && 'VideoEncoder' in window && (!needsMainSource(c, plan) || !!videoFileRef.current);
  const noExportReason = (c: Composition, plan: ReturnType<typeof editorDocumentRenderPlan>) =>
    needsMainSource(c, plan) && !videoFileRef.current ? t('common.localSourceVideoMissing') : t('workbench.browserCannotExport');

  /** What the export composites: the render view of the composition and every source, mask and clip it
   *  sounds and shows. The video export and the loudness of its mix read the same input. */
  const exportInput = (c: Composition, plan: ReturnType<typeof editorDocumentRenderPlan>, audio: AudioExportEntry[] | null) => {
    const primary = primaryNarrativeRenderPlan(plan);
    return {
      comp: compositionRenderView(c, plan),
      videoPlacements: primary.activePlacements,
      primaryVisualHidden: primary.hidden,
      primaryAudioMuted: primary.muted,
      visualMediaClips: supplementalVisualMedia(plan),
      timelineDurationSec: plan.durationSec,
      videoFile: videoFileRef.current,
      clipFiles: clipFilesRef?.current ?? new Map(),
      audio,
      denoise: denoiseExportRef?.current?.() ?? null,
      audioMasks: exportAudioMasks(documentRef.current, c),
      clipMasks: clipAudioMasks(documentRef.current),
    };
  };

  /** Integrated loudness (LUFS) of the timeline as it would export now, before the project's loudness
   *  gain: the mix of every audible clip at its own level. Null when nothing sounds. */
  const measureMixLoudness = async (): Promise<number | null> => {
    await prepareExportAssets?.(documentRef.current);
    const c = compRef.current;
    const plan = editorDocumentRenderPlan(documentRef.current, { resolveAssetUrl });
    if (plan.durationFrames === 0) return null;
    if (!canClientExport(c, plan)) throw new Error(noExportReason(c, plan));
    const audio = await (audioExportRef?.current?.() ?? Promise.resolve(null));
    return measureExportLoudness(exportInput(c, plan, audio));
  };

  /** Get the finished-video blob for the current content: use the cache on hit, otherwise composite once client-side (reports progress, cancelable). */
  const renderBlob = async (
    c: Composition,
    plan: ReturnType<typeof editorDocumentRenderPlan>,
    key: string,
    opts: ExportRenderOpts,
    audio: AudioExportEntry[] | null,
  ): Promise<Blob> => {
    const cached = lastExportRef.current;
    if (cached && cached.key === key && cached.blob) return cached.blob;
    const blob = await clientExportVideo({
      ...exportInput(c, plan, audio),
      render: opts,
      onProgress: (done, total) => setExportPct(Math.round((done / total) * 100)),
      shouldCancel: () => exportCancelRef.current,
    });
    lastExportRef.current = { key, blob, opts };
    return blob;
  };

  /** Export = client compositing + delivery (local sink when requested, browser download otherwise).
   *  Unsupported → honest error (no longer silently routed to server render that produces a black clip).
   *  Returns a result for the agent export tools (export action:start / action:status): on success includes the
   *  saved filename and how the file was delivered. */
  async function exportVideo(opts: ExportRenderOpts, sinkUrl?: string): Promise<{ ok: boolean; filename?: string; error?: string } & Partial<ExportDelivery>> {
    if (busyRef.current) return { ok: false, error: tEnglish('common.exportAlreadyProgress') };
    busyRef.current = true;
    try {
      return await runExport(opts, sinkUrl);
    } finally {
      busyRef.current = false;
    }
  }
  async function runExport(opts: ExportRenderOpts, sinkUrl?: string): Promise<{ ok: boolean; filename?: string; error?: string } & Partial<ExportDelivery>> {
    // Every referenced local source must be resolvable BEFORE the plan is read, or the plan omits
    // the clip (batch export right after an output switch used to lose the picture-in-picture video).
    await prepareExportAssets?.(documentRef.current);
    const c = compRef.current;
    // Snapshot the canonical document once. Edits made while encoding belong to the next export;
    // they must not change placements under an already-computed cache key.
    const document = documentRef.current;
    const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
    if (plan.durationFrames === 0) {
      toast.error(t('common.nothingToExport'));
      return { ok: false, error: tEnglish('common.nothingToExport') };
    }
    if (!canClientExport(c, plan)) {
      toast.error(noExportReason(c, plan));
      return { ok: false, error: noExportReason(c, plan) };
    }
    const name = filenameFor(opts, outputTitle?.());
    setExporting(true);
    setExportPct(0);
    exportCancelRef.current = false;
    try {
      const audio = await (audioExportRef?.current?.() ?? Promise.resolve(null));
      const key = exportKey(document, plan, opts, audio);
      if (lastExportRef.current?.key === key && lastExportRef.current.blob) {
        toast.success(t('common.downloadedPreviousExport'));
        const delivery = await deliverBlob(lastExportRef.current.blob, name, sinkUrl);
        return { ok: true, filename: name, ...delivery };
      }
      const blob = await renderBlob(c, plan, key, opts, audio);
      const delivery = await deliverBlob(blob, name, sinkUrl);
      toast.success(delivery.delivered === 'local_sink' ? t('common.exportCompleteDelivered') : t('common.exportCompleteDownloadStarted'));
      return { ok: true, filename: name, ...delivery };
    } catch (e) {
      if (e instanceof ExportCanceled) {
        toast.info(t('common.exportCanceled'));
        return { ok: false, error: tEnglish('common.exportWasCanceled') };
      }
      console.warn('[studio] client export failed', e);
      toast.error(t('common.exportFailedTryAgain'));
      return { ok: false, error: e instanceof Error ? e.message : t('common.exportFailed') };
    } finally {
      setExporting(false);
    }
  }

  return {
    exporting,
    exportPct,
    exportVideo,
    measureMixLoudness,
    cancelExport: () => {
      exportCancelRef.current = true;
    },
    /** On source swap, clear the result cache (the key already includes the source fingerprint so it won't mis-hit; clearing is to free blob memory). */
    resetExport: () => {
      lastExportRef.current = null;
    },
  };
}
