'use client';

/**
 * Export the finished video: dialog options (resolution/fps/format) → **client-side compositing** →
 * auto download. Publishing goes through publishVideo instead.
 *
 * - **Client-side compositing only** (zero local upload, frame-exact with the preview, full insert-clip/
 *   framing coverage). No WebCodecs or missing local video → honest error (no longer silently handed to
 *   server render — after canvas-ization it produced an all-black video track, was never validated, deprecated).
 * - Result cache: comp + source fingerprint + export options all unchanged → don't re-composite, just re-download the last result.
 * - Publish (publishVideo): upload the **finished video** to R2 for a public direct link fed to the publish
 *   center (source video never uploaded; the finished video can be). Triggered on demand (only when "Publish"
 *   is clicked), same content not re-uploaded. 200MB cap (presign) — honest error if exceeded.
 */

import { useRef, useState, type MutableRefObject } from 'react';
import { toast } from '@pireel/ui/toast';
import type { Composition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { fileSig } from './media';
import { ExportCanceled, type ExportRenderOpts, clientExportVideo } from './client-export';
import { t } from './i18n';

/** presign's hard cap (413 past it); intercept early to give a human message. */
const MAX_PUBLISH_BYTES = 200 * 1024 * 1024;

/** Trigger a browser download (blob stays in the cache ref; the URL is revoked once done). */
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, '');
const filenameFor = (o: ExportRenderOpts) => t('common.exportFilename', { res: o.res, stamp: stamp(), format: o.format });

export function useStudioExport(deps: {
  compRef: MutableRefObject<Composition>;
  videoFileRef: MutableRefObject<File | null>;
  /** Local insert-clip File table (key = blob URL); used by client compositing to fetch insert clips. */
  clipFilesRef?: MutableRefObject<Map<string, File>>;
}) {
  const { compRef, videoFileRef, clipFilesRef } = deps;
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  // Public direct link after the finished video is uploaded (R2): the data source for the "Publish"
  // entry. The client-composited local blob has no public link; this only has a value after publishVideo uploads
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const exportCancelRef = useRef(false); // User clicked "Cancel export": stop compositing and unlock the UI
  const uploadedExportRef = useRef<{ key: string; url: string } | null>(null); // Upload result (same content not re-uploaded)
  /** Last-result cache: key = comp + source fingerprint + options. Unchanged → re-download/publish directly, don't re-composite. */
  const lastExportRef = useRef<{ key: string; blob?: Blob; opts: ExportRenderOpts } | null>(null);

  /** Full comp JSON + source fingerprint + options: if anything affecting the result changes, the key changes.
   *  (Insert clips appear as blob URLs in comp.shots, stable within a session, so they're naturally in the key.) */
  const exportKey = (c: Composition, opts: ExportRenderOpts): string =>
    `${videoFileRef.current ? fileSig(videoFileRef.current) : (c.video?.url ?? '')}|${JSON.stringify(opts)}|${JSON.stringify(c)}`;

  /** Whether client compositing is possible locally (WebCodecs + a source File). If not = honest error, no longer handed to the deprecated server render. */
  const canClientExport = () => typeof window !== 'undefined' && 'VideoEncoder' in window && !!videoFileRef.current;
  const noExportReason = () =>
    !videoFileRef.current ? t('common.localSourceVideoMissing') : t('workbench.browserCannotExport');

  /** Get the finished-video blob for the current content: use the cache on hit, otherwise composite once client-side (reports progress, cancelable). */
  const renderBlob = async (c: Composition, key: string, opts: ExportRenderOpts): Promise<Blob> => {
    const cached = lastExportRef.current;
    if (cached && cached.key === key && cached.blob) return cached.blob;
    const blob = await clientExportVideo({
      comp: c,
      videoFile: videoFileRef.current!,
      clipFiles: clipFilesRef?.current ?? new Map(),
      render: opts,
      onProgress: (done, total) => setExportPct(Math.round((done / total) * 100)),
      shouldCancel: () => exportCancelRef.current,
    });
    lastExportRef.current = { key, blob, opts };
    return blob;
  };

  /** Export = client compositing + auto download. Unsupported → honest error (no longer silently routed to server render that produces a black clip).
   *  Returns a result for the agent export tools (export_video/track_export): on success includes the saved filename. */
  async function exportVideo(opts: ExportRenderOpts): Promise<{ ok: boolean; filename?: string; error?: string }> {
    const c = compRef.current;
    if (!c.video?.url) {
      toast.error(t('common.uploadBeforeExport'));
      return { ok: false, error: t('common.uploadBeforeExport') };
    }
    if (exporting || publishing) return { ok: false, error: t('common.exportAlreadyProgress') };
    if (!canClientExport()) {
      toast.error(noExportReason());
      return { ok: false, error: noExportReason() };
    }
    const key = exportKey(c, opts);
    const name = filenameFor(opts);
    if (lastExportRef.current?.key === key && lastExportRef.current.blob) {
      toast.success(t('common.downloadedPreviousExport'));
      downloadBlob(lastExportRef.current.blob, name);
      return { ok: true, filename: name };
    }
    setExporting(true);
    setExportPct(0);
    exportCancelRef.current = false;
    try {
      const blob = await renderBlob(c, key, opts);
      downloadBlob(blob, name);
      toast.success(t('common.exportCompleteDownloadStarted'));
      return { ok: true, filename: name };
    } catch (e) {
      if (e instanceof ExportCanceled) {
        toast.info(t('common.exportCanceled'));
        return { ok: false, error: t('common.exportWasCanceled') };
      }
      console.warn('[studio] client export failed', e);
      toast.error(t('common.exportFailedTryAgain'));
      return { ok: false, error: e instanceof Error ? e.message : t('common.exportFailed') };
    } finally {
      setExporting(false);
    }
  }

  /** Publish = composite the finished video client-side → upload to R2 for a public direct link → light up publishUrl (source video never uploaded, finished video can be).
   *  Triggered on demand (only runs when "Publish" is clicked); if the same content was uploaded before, reuse the last link. Returns the public URL (null on failure/cancel). */
  async function publishVideo(opts: ExportRenderOpts): Promise<string | null> {
    const c = compRef.current;
    if (!c.video?.url) {
      toast.error(t('common.uploadVideoFirst'));
      return null;
    }
    if (exporting || publishing) return null;
    if (!canClientExport()) {
      toast.error(noExportReason());
      return null;
    }
    const key = exportKey(c, opts);
    if (uploadedExportRef.current?.key === key) {
      // Same content already uploaded: reuse the direct link
      setPublishUrl(uploadedExportRef.current.url);
      return uploadedExportRef.current.url;
    }
    setPublishing(true);
    setExportPct(0);
    exportCancelRef.current = false;
    try {
      const blob = await renderBlob(c, key, opts);
      if (blob.size > MAX_PUBLISH_BYTES) {
        toast.error(t('common.exportTooLargeToPublish'));
        return null;
      }
      toast.success(t('common.uploadingExport'));
      const { url } = await studioProviders().uploads.upload(blob, { contentType: blob.type || 'video/mp4', filename: filenameFor(opts) });
      uploadedExportRef.current = { key, url };
      setPublishUrl(url);
      return url;
    } catch (e) {
      if (e instanceof ExportCanceled) toast.info(t('common.canceled'));
      else {
        console.warn('[studio] publish upload failed', e);
        toast.error(t('workbench.publishPrepareFailed'));
      }
      return null;
    } finally {
      setPublishing(false);
    }
  }

  return {
    exporting,
    publishing,
    exportPct,
    exportVideo,
    publishVideo,
    publishUrl,
    cancelExport: () => {
      exportCancelRef.current = true;
    },
    /** On source swap, clear the result cache and publish link (the key already includes the source fingerprint so it won't mis-hit; clearing is to free blob memory). */
    resetExport: () => {
      lastExportRef.current = null;
      uploadedExportRef.current = null;
      setPublishUrl(null);
    },
  };
}
