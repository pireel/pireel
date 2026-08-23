'use client';

/**
 * Clip insertion for the multi-source main track: read durations, insert an equal-standing clip at the
 * nearest shot bound (library asset / local file / image→still-clip), recover dead blob sources on draft
 * restore, reconnect by re-picking, plus per-source filmstrips for inserted clips. Extracted from
 * hyperframes-workbench.tsx — bodies verbatim.
 */

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Composition,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type MediaTimelineClip,
  type MediaRef,
  type VideoShot,
  applyEditorCommand,
  addNarrativeDocumentClip,
  isSentenceCaption,
  positiveDurationFrames,
  resolveCaptionStyle,
  secondsToTimelineFrames,
  shotId,
} from '@pireel/studio-engine/composition';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type FilmstripFrame, extractFilmstrip, extractFilmstripFromUrl, fileSig } from './media';
import { alignFileToSig, loadLocalAssetFile, loadLocalVideo, saveLocalVideo } from './local-media';
import { materializeRemoteMedia } from './remote-media';
import {
  isDeviceLocalLibraryAsset,
  localImageSigFromLibraryAsset,
} from './library-asset-source';
import { normalizeDims } from './workbench-utils';
import { t } from './i18n';
import { editorErrorMessage } from './editor-error';
import { registerNarrativeSourceRuntime, type PrimaryNarrativeSourceRuntime } from './clip-source-runtime';
import type { TimelineInsertMode, TimelineMediaDropTarget, TimelineVisualDropTarget } from './timeline-asset-drop';

interface InsertClipCoreOptions {
  placement?: 'nearest' | 'exact';
  mode?: TimelineInsertMode;
  sceneId?: string;
  localAsset?: LocalAssetIndexEntry;
}

interface InsertLibraryClipOptions {
  target?: TimelineMediaDropTarget;
  mode?: TimelineInsertMode;
}

export interface ClipInsertDeps {
  projectId: string;
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  clipFilesRef: MutableRefObject<Map<string, File>>;
  cloudMediaRef: MutableRefObject<{ video?: { sig: string; key: string }; clips?: Record<string, { key: string }> }>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  localAssetIndexRef: MutableRefObject<LocalAssetIndexEntry[]>;
  setDocument: (document: EditorDocumentV2) => void;
  rememberAssetUrl: (assetId: string, url: string) => void;
  onPrimarySource: (source: PrimaryNarrativeSourceRuntime) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  applyT: (v: number) => void;
  pushUndoSnapshot: () => void;
  ensureClipTranscripts: () => Promise<void>;
  backupMediaToCloud: (file: File, sig: string, kind: 'video' | 'clip') => void;
  runTool: (toolId: string, input: Record<string, unknown>) => Promise<unknown>;
  visualSources?: readonly { kind: 'image' | 'video'; source: string; sourceOutSec: number }[];
}

export function useClipInsert(deps: ClipInsertDeps) {
  const {
    projectId, comp, compRef, clipFilesRef, cloudMediaRef, clipAsrRef, documentRef, localAssetIndexRef, setDocument,
    rememberAssetUrl, onPrimarySource, setSelectedId, setSelectedShotId, applyT, pushUndoSnapshot, ensureClipTranscripts,
    backupMediaToCloud, runTool,
    visualSources = [],
  } = deps;
  const videoMetaOf = async (url: string): Promise<{ dur: number; w: number; h: number } | null> => {
    for (let i = 0; i < 3; i++) {
      const m = await videoMetaOnce(url);
      if (m != null) return m;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
  };
  const videoDurationOf = async (url: string): Promise<number | null> => (await videoMetaOf(url))?.dur ?? null;
  const videoMetaOnce = (url: string): Promise<{ dur: number; w: number; h: number } | null> =>
    new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      let settled = false;
      const done = (d: number | null) => {
        if (settled) return;
        settled = true;
        res(d != null ? { dur: d, w: v.videoWidth, h: v.videoHeight } : null);
      };
      const dur = () => (Number.isFinite(v.duration) && v.duration > 0.1 ? v.duration : null);
      v.onerror = () => done(null);
      v.onloadedmetadata = () => {
        if (dur() != null) return done(dur());
        v.ondurationchange = () => {
          if (dur() != null) done(dur());
        };
        v.currentTime = 1e7;
        setTimeout(() => done(dur()), 3000);
      };
      v.src = url;
    });
  /** Landing point (final seconds) while an external clip is being inserted (reading duration/extracting frames): the timeline shows an "inserting" badge there. */
  const [clipPending, setClipPending] = useState<number | null>(null);
  /** Filmstrips for external clips (**src → frames**, t = that source's own source time): the main filmstrip belongs
   *  only to the main video; clips extract one set per **source**, shared by all clips of the same source — split/delete
   *  just change the span, no re-extract (extracting by shot.id once meant a split's right half was a new id, re-extracting
   *  the whole thing, a visibly flickering filmstrip redraw on large files). */
  const [clipStrips, setClipStrips] = useState<Record<string, FilmstripFrame[]>>({});
  const clipStripsRef = useRef<Record<string, FilmstripFrame[]>>({});
  clipStripsRef.current = clipStrips;
  const clipStripAliveRef = useRef(true);
  const clipStripGenerationRef = useRef(0);
  const clipStripReqRef = useRef<Set<string>>(new Set()); // sources already requested (incl. in progress), prevents duplicate extraction
  useEffect(() => {
    const requests = clipStripReqRef.current;
    clipStripAliveRef.current = true;
    return () => {
      clipStripGenerationRef.current += 1;
      clipStripAliveRef.current = false;
      for (const frames of Object.values(clipStripsRef.current)) {
        for (const frame of frames) URL.revokeObjectURL(frame.url);
      }
      clipStripsRef.current = {};
      requests.clear();
    };
  }, []);
  const resetRuntime = useCallback(() => {
    clipStripGenerationRef.current += 1;
    for (const frames of Object.values(clipStripsRef.current)) {
      for (const frame of frames) URL.revokeObjectURL(frame.url);
    }
    clipStripsRef.current = {};
    clipStripReqRef.current.clear();
    setClipStrips({});
    setClipPending(null);
  }, []);
  const createClipObjectUrl = (file: Blob): string | null =>
    clipStripAliveRef.current ? URL.createObjectURL(file) : null;
  useEffect(() => {
    const bySrc = new Map<string, number>(); // src → the maximum source time covered
    for (const s of comp.shots ?? []) if (s.src) bySrc.set(s.src, Math.max(bySrc.get(s.src) ?? 0, s.srcEnd));
    for (const visual of visualSources) {
      if (visual.kind === 'video') bySrc.set(visual.source, Math.max(bySrc.get(visual.source) ?? 0, visual.sourceOutSec));
    }
    for (const [src, maxEnd] of bySrc) {
      if (clipStripReqRef.current.has(src)) continue;
      clipStripReqRef.current.add(src);
      const upTo = Math.max(0.5, maxEnd);
      const generation = clipStripGenerationRef.current;
      void (async () => {
        try {
          const onFrame = (fr: FilmstripFrame) => {
            if (!clipStripAliveRef.current || generation !== clipStripGenerationRef.current) {
              URL.revokeObjectURL(fr.url);
              return;
            }
            setClipStrips((m) => ({ ...m, [src]: [...(m[src] ?? []), fr].sort((a, b) => a.t - b.t) }));
          };
          if (src.startsWith('blob:')) {
            const lf = clipFilesRef.current.get(src); // local mode: the File is already at hand, zero download
            if (!lf) {
              clipStripReqRef.current.delete(src); // File not in place yet (restoring): undo the placeholder, retry once src is revived
              return;
            }
            await extractFilmstrip(lf, upTo, Math.min(60, Math.max(4, Math.round(upTo))), onFrame);
          } else {
            const proxyUrl = `/api/media/fetch?url=${encodeURIComponent(src)}`;
            await extractFilmstripFromUrl(proxyUrl, upTo, Math.min(60, Math.max(4, Math.round(upTo))), onFrame);
          }
        } catch (e) {
          console.warn('[studio] clip filmstrip failed', e);
        }
      })();
    }
  }, [clipFilesRef, comp.shots, visualSources]);
  /** Nearest explicit V2 boundary, including leading/inter-clip gaps. */
  const nearestShotBound = (document: EditorDocumentV2, t: number) => {
    let at = 0;
    let best = Infinity;
    const track = document.timeline.tracks.find((candidate) => candidate.id === document.semantics.primaryNarrativeTrackId);
    const fps = document.canvas.fps;
    const bounds = [0, ...(track?.clips.flatMap((clip) => [clip.startFrame / fps, (clip.startFrame + clip.durationFrames) / fps]) ?? [])];
    bounds.forEach((b) => {
      const d = Math.abs(b - t);
      if (d < best) {
        best = d;
        at = b;
      }
    });
    return at;
  };
  /** Insert core: an external clip lands at the nearest split point (an equal-standing clip: framing/matte/audio/captions
   *  same as the main source). Overlay blocks after the boundary shift right as a whole — the mirror of removeEditedInterval. file = local mode (blob url). */
  const insertClipCore = (url: string, clipDur: number, atWish: number, file?: File, srcDims?: { w: number; h: number } | null, srcSigOverride?: string | null, options: InsertClipCoreOptions = {}): string => {
    // First source into an empty project DECIDES the canvas ratio (per user) — later sources
    // contain-fit into it; the ratio picker can override afterwards.
    const documentBeforeInsert = documentRef.current;
    const at = options.placement === 'exact' ? Math.max(0, atWish) : nearestShotBound(documentBeforeInsert, atWish);
    const newlyOwnedObjectUrl = !!file && url.startsWith('blob:') && !clipFilesRef.current.has(url);
    const sg = srcSigOverride ?? (file ? fileSig(file) : undefined);
    const nb: VideoShot = { id: shotId(), src: url, ...(sg ? { srcSig: sg } : {}), srcStart: 0, srcEnd: clipDur, treatment: 'full' };
    const dims = srcDims ? normalizeDims(srcDims.w, srcDims.h) : undefined;
    const edit = addNarrativeDocumentClip({
      document: documentBeforeInsert,
      shot: nb,
      atSec: at,
      ...(options.mode ? { mode: options.mode } : {}),
      ...(dims ? { sourceWidth: dims.width, sourceHeight: dims.height } : {}),
      ...(options.sceneId ? { sceneId: options.sceneId } : {}),
      ...(options.localAsset ? {
        assetId: options.localAsset.assetId,
        assetLabel: options.localAsset.label,
        assetLibrary: {
          createdAt: options.localAsset.createdAt,
          ...(options.localAsset.folder ? { folder: options.localAsset.folder } : {}),
        },
      } : {}),
    });
    if (!edit.ok || !edit.assetId) {
      if (newlyOwnedObjectUrl) URL.revokeObjectURL(url);
      toast.error(edit.ok ? t('workbench.failedFetchInsertClip') : editorErrorMessage(edit.error));
      return '';
    }
    if (file && sg) {
      registerNarrativeSourceRuntime({
        documentBeforeInsert,
        source: { file, url, sig: sg, durationSec: clipDur },
        clipFiles: clipFilesRef.current,
        onPrimarySource,
      });
    }
    // srcSigOverride = the source already has a LOCAL identity (including image → 5s derived still):
    // persist bytes on-device and sync metadata only. Sig-less remote sources still use the legacy
    // cloud rendezvous so a fetched CDN asset does not turn into an unrecoverable document-local blob.
    if (file && !srcSigOverride) backupMediaToCloud(file, fileSig(file), 'clip');
    pushUndoSnapshot();
    rememberAssetUrl(edit.assetId, url);
    setDocument(edit.document);
    setSelectedId(null);
    setSelectedShotId(nb.id);
    applyT(at + Math.min(0.1, clipDur / 2));
    toast.success(t('workbench.insertedBRoll'));
    // Captions/translation already on → the new clip follows automatically (transcribe → re-lay captions; if a target language was chosen, also auto-fill the translation in that language)
    if (compRef.current.blocks.some(isSentenceCaption)) void autoCaptionNewClip(url, nb.id);
    return nb.id;
  };
  /** Auto-complete captions/translation for a newly inserted clip: a bonus, silent on failure (the panel/agent can still fill manually). */
  const autoCaptionNewClip = async (src: string, insertedShotId: string) => {
    try {
      await ensureClipTranscripts(); // transcribe new sources on demand (cache / failure blacklist handled internally)
      const segs = clipAsrRef.current[src];
      if (!segs?.length) return;
      // Transcript state drives the native caption derivation effect; no compatibility re-lay write.
      // A target language was chosen in the panel → auto-fill the new clip's translation in that language (same executor writes data as manual translation)
      const lang = resolveCaptionStyle(compRef.current).sub?.lang;
      const t = studioProviders().translate;
      if (lang && t) {
        const out = await t(segs.map((x, i) => ({ index: i, text: x.text })), lang);
        if (out.length) await runTool('set_caption_translations', { shotId: insertedShotId, items: out });
      }
    } catch {
      /* auto-complete failure is silent: the captions panel / agent can fill manually */
    }
  };
  /** Draft restore: a local clip's src is a dead blob — fetch the File from OPFS by srcSig and rebuild the blob src.
   *  The two split halves of the same src share one fetch; unrecoverable ones stay as-is (card shows a base color, preview a black segment, no worse than before). */
  const recoverLocalClips = async (shots: VideoShot[]) => {
    const remap = new Map<string, string>(); // old src → new blob src
    const clipById = new Map(documentRef.current.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
    for (const s of shots) {
      if (!s.src || !s.srcSig || remap.has(s.src) || clipFilesRef.current.has(s.src)) continue;
      let f = await loadLocalVideo(s.srcSig);
      const clip = clipById.get(s.id);
      const cloudKey = clip && 'assetId' in clip && clip.assetId
        ? documentRef.current.assets[clip.assetId]?.locator.cloudKey
        : undefined;
      if (!f && (cloudMediaRef.current.clips?.[s.srcSig] || cloudKey)) {
        const cf = await studioProviders().vault.fetch(s.srcSig); // cloud byte rendezvous fallback
        if (cf) f = alignFileToSig(cf, s.srcSig); // vault files carry their own name/mtime — realign or the identity drifts
      }
      if (!f) continue;
      void saveLocalVideo(f, s.srcSig); // cloud-fetched files land back in the local library, instant next time
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name)) {
        // Image-identity source (5s still clip): the stored bytes are the IMAGE — re-derive the clip
        const still = await stillClipFromImage(f);
        if (!still) continue;
        f = still;
      }
      const url = createClipObjectUrl(f);
      if (!url) continue;
      clipFilesRef.current.set(url, f);
      remap.set(s.src, url);
    }
    if (remap.size) {
      for (const shot of shots) {
        const url = shot.src ? remap.get(shot.src) : undefined;
        const clip = clipById.get(shot.id);
        if (url && clip?.kind === 'narrative') rememberAssetUrl(clip.assetId, url);
      }
      setDocument(documentRef.current);
    }
    // Unrecovered dead links (blob src with no File): say so plainly and point to reconnection — previously a silent black
    // segment, whereas the main video has a "re-import" prompt in the same case; equal-standing clips deserve their own repair path
    const dead = new Set(
      shots.map((s) => s.src).filter((src): src is string => !!src && src.startsWith('blob:') && !remap.has(src) && !clipFilesRef.current.has(src)),
    );
    if (dead.size) toast.error(t('workbench.insertSourcesMissing', { n: dead.size }));
  };

  /** Image → 5-second still-frame video (the user-defined default): freeze on canvas + MediaBunny avc mp4, no audio track
   *  = silent clip. Uses a video shape rather than adding an image branch to shots — trim/split/framing/captions/export
   *  all work automatically with zero changes. 30fps of identical frames, near-zero encode cost; dimensions clamped ≤1920 and made even (avc requirement). */
  const STILL_CLIP_SEC = 5;
  const stillClipFromImage = async (blob: Blob, label?: string): Promise<File | null> => {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const w = Math.max(2, Math.round((bmp.width * scale) / 2) * 2);
      const h = Math.max(2, Math.round((bmp.height * scale) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await import('mediabunny');
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 2_000_000 });
      output.addVideoTrack(source, { frameRate: 30 });
      await output.start();
      for (let i = 0; i < STILL_CLIP_SEC * 30; i++) await source.add(i / 30, 1 / 30);
      await output.finalize();
      const buf = (output.target as { buffer: ArrayBuffer | null }).buffer;
      if (!buf) return null;
      // Filename carries size + label: fileSig=name:size:0, and a plain 'still.mp4' collides on sig whenever size collides (cloud backup / OPFS cross-contamination)
      const name = `still-${w}x${h}-${(label || 'image').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'image'}.mp4`;
      return new File([buf], name, { type: 'video/mp4', lastModified: 0 });
    } catch (e) {
      console.warn('[studio] still clip encode failed', e);
      return null;
    }
  };
  /** Reconnect every shot that references one indexed local asset. Images are identities of record:
   *  reselect the original image, derive a fresh local still clip, and keep srcSig pointing at the image. */
  const reconnectIndexedSource = async (oldSrc: string, sourceFile: File, sig: string, kind: 'video' | 'image') => {
    const playbackFile = kind === 'image' ? await stillClipFromImage(sourceFile, sourceFile.name) : sourceFile;
    if (!playbackFile) {
      toast.error(t('workbench.couldNotConvertImage'));
      return false;
    }
    const url = createClipObjectUrl(playbackFile);
    if (!url) return false;
    clipFilesRef.current.set(url, playbackFile);
    await saveLocalVideo(sourceFile, sig).catch(() => {});
    const clipById = new Map(documentRef.current.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
    for (const shot of compRef.current.shots ?? []) {
      if (shot.src !== oldSrc) continue;
      const clip = clipById.get(shot.id);
      if (clip?.kind === 'narrative') rememberAssetUrl(clip.assetId, url);
    }
    setDocument(documentRef.current);
    toast.success(t('workbench.bRollReconnected'));
    return true;
  };

  const uniqueDocumentId = (base: string, used: ReadonlySet<string>) => {
    const stem = base.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'item';
    let value = stem;
    let suffix = 2;
    while (used.has(value)) value = `${stem}_${suffix++}`;
    return value;
  };

  /** Place native visual media on a real V2 visual lane. This intentionally keeps image assets as
   * images (instead of encoding a five-second video) and keeps embedded video audio attached to the
   * visual clip. The render/export plan already understands both forms. */
  const insertVisualCore = (input: {
    asset: MediaRef & { label?: string; sig?: string | null; localAssetId?: string | null; dims?: { w: number; h: number } };
    url: string;
    file: File;
    durationSec: number;
    dimensions?: { w: number; h: number } | null;
    atSec: number;
    target: TimelineVisualDropTarget;
    mode: TimelineInsertMode;
  }): string => {
    const before = documentRef.current;
    const durableSig = input.asset.sig ?? fileSig(input.file);
    const remoteUrl = !isDeviceLocalLibraryAsset(input.asset)
      ? input.asset.url
      : undefined;
    const existing = input.asset.localAssetId
      ? before.assets[input.asset.localAssetId]
      : Object.values(before.assets).find((asset) => asset.kind === input.asset.type && (
          asset.locator.localSig === durableSig || (!!remoteUrl && asset.locator.remoteUrl === remoteUrl)
        ));
    const usedAssetIds = new Set(Object.keys(before.assets));
    const assetId = existing?.id
      ?? (input.asset.localAssetId && !usedAssetIds.has(input.asset.localAssetId)
        ? input.asset.localAssetId
        : uniqueDocumentId(`asset_${input.asset.type}_${shotId()}`, usedAssetIds));
    const localEntry = input.asset.localAssetId
      ? localAssetIndexRef.current.find((entry) => entry.assetId === input.asset.localAssetId)
      : undefined;
    const mediaAsset: EditorMediaAsset = existing ?? {
      id: assetId,
      kind: input.asset.type,
      label: input.asset.label ?? input.file.name,
      locator: { localSig: durableSig, ...(remoteUrl ? { remoteUrl } : {}) },
      metadata: {
        durationSec: input.durationSec,
        ...(input.dimensions?.w ? { width: input.dimensions.w } : {}),
        ...(input.dimensions?.h ? { height: input.dimensions.h } : {}),
        ...(input.asset.type === 'video' ? { hasAudio: true } : {}),
      },
      ...(localEntry ? {
        library: {
          createdAt: localEntry.createdAt,
          ...(localEntry.folder ? { folder: localEntry.folder } : {}),
        },
      } : {}),
    };
    let document: EditorDocumentV2 = existing
      ? before
      : { ...before, assets: { ...before.assets, [assetId]: mediaAsset } };
    let trackId: string;
    if (input.target.kind === 'visual') {
      const requestedTrackId = input.target.trackId;
      const track = document.timeline.tracks.find((candidate) => candidate.id === requestedTrackId);
      if (!track || track.type === 'audio' || track.id === document.semantics.primaryNarrativeTrackId) {
        toast.error(t('workbench.failedFetchInsertClip'));
        return '';
      }
      trackId = track.id;
    } else {
      trackId = uniqueDocumentId(`track_visual_${shotId()}`, new Set(document.timeline.tracks.map((track) => track.id)));
      const insertedTrack = applyEditorCommand(document, {
        type: 'track.insert',
        track: {
          id: trackId,
          type: 'visual',
          role: 'broll',
          name: 'Visual media',
          stackOrder: input.target.stackOrder,
          syncLocked: true,
        },
      });
      if (!insertedTrack.ok) {
        toast.error(editorErrorMessage(insertedTrack.error));
        return '';
      }
      document = insertedTrack.document;
    }
    const clipId = uniqueDocumentId(`clip_visual_${shotId()}`, new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id))));
    const durationFrames = positiveDurationFrames(input.durationSec, document.canvas.fps);
    const clip: Omit<MediaTimelineClip, 'startFrame'> & { offsetFrames: number } = {
      id: clipId,
      kind: 'media',
      assetId,
      offsetFrames: 0,
      durationFrames,
      enabled: true,
      sourceInSec: 0,
      sourceOutSec: input.durationSec,
      fit: 'cover',
    };
    const inserted = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId,
      atFrame: secondsToTimelineFrames(Math.max(0, input.atSec), document.canvas.fps),
      clips: [clip],
      mode: input.mode,
      includeLinked: true,
    });
    if (!inserted.ok) {
      toast.error(editorErrorMessage(inserted.error));
      return '';
    }
    clipFilesRef.current.set(input.url, input.file);
    void saveLocalVideo(input.file, durableSig, undefined, localEntry ? {
      binding: { projectId, assetId: localEntry.assetId },
    } : undefined).catch(() => {});
    pushUndoSnapshot();
    rememberAssetUrl(assetId, input.url);
    setDocument(inserted.document);
    setSelectedId(null);
    setSelectedShotId(null);
    applyT(Math.max(0, input.atSec) + Math.min(0.1, input.durationSec / 2));
    toast.success(t('workbench.insertedBRoll'));
    return clipId;
  };

  const insertLibraryVisualAt = async (
    a: MediaRef & { label?: string; sig?: string | null; localAssetId?: string | null; dims?: { w: number; h: number } },
    at: number,
    target: TimelineVisualDropTarget,
    mode: TimelineInsertMode,
  ) => {
    const locatorSig = localImageSigFromLibraryAsset(a);
    const asset = locatorSig ? { ...a, sig: locatorSig } : a;
    let file: File | null = null;
    const held = a.type === 'video' ? clipFilesRef.current.get(a.url) : undefined;
    if (held) file = held;
    const localEntry = a.localAssetId
      ? localAssetIndexRef.current.find((entry) => entry.assetId === a.localAssetId)
      : undefined;
    if (!file && localEntry) file = await loadLocalAssetFile(projectId, localEntry);
    if (!file && locatorSig) file = await loadLocalVideo(locatorSig);
    const local = isDeviceLocalLibraryAsset(a);
    if (!file && !local) {
      try {
        const materialized = await materializeRemoteMedia(a.url, {
          name: a.label || (a.type === 'video' ? 'video.mp4' : 'image'),
          type: a.type === 'video' ? 'video/mp4' : 'image/png',
          sig: asset.sig,
          pinned: false,
        });
        file = materialized.file;
        if (!asset.sig) asset.sig = materialized.sig;
      } catch {
        /* Report the common failure below. */
      }
    }
    if (!file) {
      toast.error(t(local ? 'workbench.localAssetUnreachable' : 'workbench.couldNotFetchAsset'));
      return;
    }
    if (asset.sig) file = alignFileToSig(file, asset.sig);
    const url = createClipObjectUrl(file);
    if (!url) return;
    if (a.type === 'video') {
      const meta = await videoMetaOf(url);
      if (!meta) {
        URL.revokeObjectURL(url);
        toast.error(t('workbench.couldNotReadDuration'));
        return;
      }
      const inserted = insertVisualCore({ asset, url, file, durationSec: Math.round(meta.dur * 100) / 100, dimensions: meta, atSec: at, target, mode });
      if (!inserted) URL.revokeObjectURL(url);
      return;
    }
    const inserted = insertVisualCore({ asset, url, file, durationSec: STILL_CLIP_SEC, dimensions: a.dims ?? null, atSec: at, target, mode });
    if (!inserted) URL.revokeObjectURL(url);
  };
  /** Dragging a library image/video onto the main track = insert a clip (per user 2026-07-17, reversing "video-into-main-track
   *  was cut" — what was cut back then was OS file drops; library assets have direct links and caching, so the experience holds).
   *  Bytes first via the asset direct link (CDN CORS is allowed), falling back to the /api/media/fetch same-origin proxy; then
   *  the same insertClipCore as local first-media insertion (local persistence/caption auto-follow reused). */
  const insertLibraryClipAt = async (a: MediaRef & { label?: string; sig?: string | null; localAssetId?: string | null; dims?: { w: number; h: number } }, at: number, options: InsertLibraryClipOptions = {}) => {
    const locatorSig = localImageSigFromLibraryAsset(a);
    let effectiveSig = locatorSig ?? a.sig;
    const localEntry = a.localAssetId
      ? localAssetIndexRef.current.find((entry) => entry.assetId === a.localAssetId)
      : undefined;
    const target = options.target ?? { kind: 'primary' as const };
    const mode = options.mode ?? 'ripple';
    setClipPending(at);
    try {
      if (target.kind !== 'primary') {
        await insertLibraryVisualAt(a, at, target, mode);
        return;
      }
      const coreOptions: InsertClipCoreOptions = options.target
        ? { placement: 'exact', mode, ...(localEntry ? { localAsset: localEntry } : {}) }
        : { ...(localEntry ? { localAsset: localEntry } : {}) };
      // Source already loaded this session (panel card for an on-track clip): reuse the held File
      // outright — no fetch, no byte copy, and it works even if OPFS/handle lanes are cold.
      if (a.type === 'video') {
        const held = clipFilesRef.current.get(a.url);
        if (held) {
          const url = createClipObjectUrl(held);
          if (!url) return;
          const meta = await videoMetaOf(url);
          if (meta) {
            insertClipCore(url, Math.round(meta.dur * 100) / 100, at, held, meta, a.sig, coreOptions);
            return;
          }
          URL.revokeObjectURL(url);
        }
      }
      // Same asset already on the track (matched by sig): SHARE its src — one object URL and one
      // engine decoder per file, no matter how many times it's inserted; the panel's per-file card
      // dedupe relies on this staying the common case.
      if (a.type === 'video' && a.sig) {
        const twin = (compRef.current.shots ?? []).find((s) => s.srcSig === a.sig && s.src && clipFilesRef.current.has(s.src));
        if (twin) {
          const dur = await videoDurationOf(twin.src!);
          if (dur) {
            insertClipCore(twin.src!, Math.round(dur * 100) / 100, at, clipFilesRef.current.get(twin.src!), null, a.sig, coreOptions);
            return;
          }
        }
      }
      // Local asset with a sig: reuse the on-device file (native handle / OPFS) — zero-copy, original
      // identity kept (srcSig === panel sig), no fetch. Falls through to the byte-fetch lane on a miss.
      if (a.type === 'video' && a.sig) {
        const f = localEntry
          ? await loadLocalAssetFile(projectId, localEntry)
          : await loadLocalVideo(a.sig);
        if (f) {
          const url = createClipObjectUrl(f);
          if (!url) return;
          const meta = await videoMetaOf(url);
          if (meta) {
            insertClipCore(url, Math.round(meta.dur * 100) / 100, at, f, meta, a.sig, coreOptions);
            return;
          }
          URL.revokeObjectURL(url);
        }
      }
      let sourceFile: File | null = null;
      if (locatorSig) sourceFile = await loadLocalVideo(locatorSig);
      else if (!isDeviceLocalLibraryAsset(a)) {
        try {
          const materialized = await materializeRemoteMedia(a.url, {
            name: a.label || (a.type === 'video' ? 'video.mp4' : 'image'),
            type: a.type === 'video' ? 'video/mp4' : 'image/png',
            sig: effectiveSig,
            pinned: false,
          });
          sourceFile = materialized.file;
          if (!effectiveSig) effectiveSig = materialized.sig;
        } catch {
          /* Report the common failure below. */
        }
      }
      // Browser URLs and pireel-local-image locators are device-local — the server proxy can never
      // fetch them. A miss here means every local byte lane failed: say so precisely.
      const local = isDeviceLocalLibraryAsset(a);
      if (!sourceFile) {
        toast.error(t(local ? 'workbench.localAssetUnreachable' : 'workbench.couldNotFetchAsset'));
        return;
      }
      if (a.type === 'video') {
        // Fetch-lane insert must not mint a new identity: when the panel told us the sig and the
        // bytes match, alignFileToSig rebuilds the File under that SAME name/mtime (otherwise the
        // panel would show the same file twice — track card + import card — after refresh).
        let f = sourceFile;
        if (effectiveSig) f = alignFileToSig(f, effectiveSig);
        const url = createClipObjectUrl(f);
        if (!url) return;
        const meta = await videoMetaOf(url);
        if (!meta) {
          URL.revokeObjectURL(url);
          toast.error(t('workbench.couldNotReadDuration'));
          return;
        }
        void saveLocalVideo(f, fileSig(f), undefined, localEntry ? {
          binding: { projectId, assetId: localEntry.assetId },
        } : undefined).catch(() => {});
        insertClipCore(url, Math.round(meta.dur * 100) / 100, at, f, meta, effectiveSig, coreOptions);
      } else {
        const f = await stillClipFromImage(sourceFile, a.label);
        if (!f) {
          toast.error(t('workbench.couldNotConvertImage'));
          return;
        }
        const url = createClipObjectUrl(f);
        if (!url) return;
        if (effectiveSig) {
          // One asset, one identity: the shot records the IMAGE's sig (panel dedupe holds — no
          // phantom "5s video" card); the image bytes persist through the local handle/OPFS only,
          // and recovery re-derives the still clip from them.
          const img = alignFileToSig(sourceFile, effectiveSig);
          void saveLocalVideo(img, effectiveSig, undefined, localEntry ? {
            binding: { projectId, assetId: localEntry.assetId },
          } : undefined).catch(() => {});
          insertClipCore(url, STILL_CLIP_SEC, at, f, a.dims ? { w: a.dims.w, h: a.dims.h } : null, effectiveSig, coreOptions);
        } else {
          void saveLocalVideo(f, fileSig(f)).catch(() => {});
          insertClipCore(url, STILL_CLIP_SEC, at, f, a.dims ? { w: a.dims.w, h: a.dims.h } : null, undefined, coreOptions);
        }
      }
    } finally {
      setClipPending(null);
    }
  };
  return { videoDurationOf, insertClipCore, recoverLocalClips, reconnectIndexedSource, insertLibraryClipAt, clipPending, clipStrips, resetRuntime };
}
