'use client';

/**
 * Clip insertion for the multi-source main track: read durations, insert an equal-standing clip at the
 * nearest shot bound (library asset / local file / image→still-clip), recover dead blob sources on draft
 * restore, reconnect by re-picking, plus per-source filmstrips for inserted clips. Extracted from
 * hyperframes-workbench.tsx — bodies verbatim.
 */

import { type MutableRefObject, type SetStateAction, useEffect, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type MediaRef,
  type VideoShot,
  isSentenceCaption,
  rippleInsertSiblingLayers,
  resolveCaptionStyle,
  shotId,
} from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import type { DraftPlan } from '@pireel/studio-engine/plan';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { type FilmstripFrame, extractFilmstrip, fileSig } from './media';
import { alignFileToSig, loadLocalVideo, saveLocalVideo } from './local-media';
import { normalizeDims } from './workbench-utils';
import { t } from './i18n';

export interface ClipInsertDeps {
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  clipFilesRef: MutableRefObject<Map<string, File>>;
  cloudMediaRef: MutableRefObject<{ video?: { sig: string; key: string }; clips?: Record<string, { key: string }> }>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  planRef: MutableRefObject<DraftPlan | null>;
  setPlan: (p: DraftPlan | null) => void;
  setComp: (action: SetStateAction<Composition>) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  applyT: (v: number) => void;
  pushUndoSnapshot: () => void;
  ensureShots: (c: Composition) => VideoShot[];
  ensureClipTranscripts: () => Promise<void>;
  relayCaptionLayer: (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null) => Block[];
  pickFile: (accept: string) => Promise<File | null>;
  backupMediaToCloud: (file: File, sig: string, kind: 'video' | 'clip') => void;
  runTool: (toolId: string, input: Record<string, unknown>) => Promise<unknown>;
}

export function useClipInsert(deps: ClipInsertDeps) {
  const {
    comp, compRef, clipFilesRef, cloudMediaRef, asrRef, clipAsrRef, planRef, setPlan, setComp, setSelectedId,
    setSelectedShotId, applyT, pushUndoSnapshot, ensureShots, ensureClipTranscripts, relayCaptionLayer, pickFile,
    backupMediaToCloud, runTool,
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
  const clipStripReqRef = useRef<Set<string>>(new Set()); // sources already requested (incl. in progress), prevents duplicate extraction
  useEffect(() => {
    const bySrc = new Map<string, number>(); // src → the maximum source time covered
    for (const s of comp.shots ?? []) if (s.src) bySrc.set(s.src, Math.max(bySrc.get(s.src) ?? 0, s.srcEnd));
    for (const [src, maxEnd] of bySrc) {
      if (clipStripReqRef.current.has(src)) continue;
      clipStripReqRef.current.add(src);
      const upTo = Math.max(0.5, maxEnd);
      void (async () => {
        try {
          let f: File;
          if (src.startsWith('blob:')) {
            const lf = clipFilesRef.current.get(src); // local mode: the File is already at hand, zero download
            if (!lf) {
              clipStripReqRef.current.delete(src); // File not in place yet (restoring): undo the placeholder, retry once src is revived
              return;
            }
            f = lf;
          } else {
            const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(src)}`);
            if (!r.ok) throw new Error(String(r.status));
            const blob = await r.blob();
            f = new File([blob], 'clip.mp4', { type: blob.type || 'video/mp4' });
          }
          await extractFilmstrip(f, upTo, Math.min(60, Math.max(4, Math.round(upTo))), (fr) => {
            setClipStrips((m) => ({ ...m, [src]: [...(m[src] ?? []), fr].sort((a, b) => a.t - b.t) }));
          });
        } catch (e) {
          console.warn('[studio] clip filmstrip failed', e);
        }
      })();
    }
  }, [comp.shots]);
  /** Nearest split point (0 + each shot's end). */
  const nearestShotBound = (shots: VideoShot[], t: number) => {
    let at = 0;
    let idx = 0;
    let best = Infinity;
    [0, ...clipSpans(shots).map((x) => x.editedEnd)].forEach((b, i) => {
      const d = Math.abs(b - t);
      if (d < best) {
        best = d;
        at = b;
        idx = i;
      }
    });
    return { at, idx };
  };
  /** Insert core: an external clip lands at the nearest split point (an equal-standing clip: framing/matte/audio/captions
   *  same as the main source). Overlay blocks after the boundary shift right as a whole — the mirror of removeEditedInterval. file = local mode (blob url). */
  const insertClipCore = (url: string, clipDur: number, atWish: number, file?: File, srcDims?: { w: number; h: number } | null, srcSigOverride?: string | null): string => {
    pushUndoSnapshot();
    // First source into an empty project DECIDES the canvas ratio (per user) — later sources
    // contain-fit into it; the ratio picker can override afterwards.
    const firstSource = !compRef.current.video && !(compRef.current.shots?.length);
    // Narrative structure changed: the old plan is void. A cached plan doesn't know about this beat, and a cached lay_out
    // would treat it as absent (scenes crossing the insert window / mismatched placeholders); re-planning is what treats the inserted clip as its own beat.
    setPlan(null);
    planRef.current = null;
    const shots = ensureShots(compRef.current);
    const { at, idx } = nearestShotBound(shots, atWish);
    if (file) clipFilesRef.current.set(url, file);
    // srcSigOverride = the source already has a LOCAL identity (including image → 5s derived still):
    // persist bytes on-device and sync metadata only. Sig-less remote sources still use the legacy
    // cloud rendezvous so a fetched CDN asset does not turn into an unrecoverable document-local blob.
    if (file && !srcSigOverride) backupMediaToCloud(file, fileSig(file), 'clip');
    const sg = srcSigOverride ?? (file ? fileSig(file) : undefined);
    const nb: VideoShot = { id: shotId(), src: url, ...(sg ? { srcSig: sg } : {}), srcStart: 0, srcEnd: clipDur, treatment: 'full' };
    setComp((c) => ({
      ...c,
      ...(firstSource && srcDims ? normalizeDims(srcDims.w, srcDims.h) : {}),
      shots: [...shots.slice(0, idx), nb, ...shots.slice(idx)],
      ...rippleInsertSiblingLayers(c, at, clipDur),
    }));
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
    const relay = () => setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
    // The insert already shifted final-cut time / split sentences: **re-lay once unconditionally first** (sentences
    // crossing the insert point are re-split by the new time). Still/silent clips have no speech to transcribe, and by
    // this point captions are already correct — previously re-laying was gated behind "the new clip transcribed sentences",
    // so silent clips returned early and the whole caption layer stayed on the old time (user reported).
    try {
      relay();
    } catch {
      /* same as below: auto-complete failure is silent */
    }
    try {
      await ensureClipTranscripts(); // transcribe new sources on demand (cache / failure blacklist handled internally)
      const segs = clipAsrRef.current[src];
      if (!segs?.length) return;
      relay(); // new-source sentences enter the layer
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
    for (const s of shots) {
      if (!s.src || !s.srcSig || remap.has(s.src) || clipFilesRef.current.has(s.src)) continue;
      let f = await loadLocalVideo(s.srcSig);
      if (!f && cloudMediaRef.current.clips?.[s.srcSig]) {
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
      const url = URL.createObjectURL(f);
      clipFilesRef.current.set(url, f);
      remap.set(s.src, url);
    }
    if (remap.size) {
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.src && remap.has(s.src) ? { ...s, src: remap.get(s.src)! } : s)) }));
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
    const url = URL.createObjectURL(playbackFile);
    clipFilesRef.current.set(url, playbackFile);
    await saveLocalVideo(sourceFile, sig).catch(() => {});
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((shot) => (shot.src === oldSrc ? { ...shot, src: url, srcSig: sig } : shot)) }));
    toast.success(t('workbench.bRollReconnected'));
    return true;
  };
  /** Dragging a library image/video onto the main track = insert a clip (per user 2026-07-17, reversing "video-into-main-track
   *  was cut" — what was cut back then was OS file drops; library assets have direct links and caching, so the experience holds).
   *  Bytes first via the asset direct link (CDN CORS is allowed), falling back to the /api/media/fetch same-origin proxy; then
   *  the same insertClipCore as the "+" button (local persistence/caption auto-follow reused). */
  const insertLibraryClipAt = async (a: MediaRef & { label?: string; sig?: string | null; dims?: { w: number; h: number } }, at: number) => {
    setClipPending(at);
    try {
      // Source already loaded this session (panel card for an on-track clip): reuse the held File
      // outright — no fetch, no byte copy, and it works even if OPFS/handle lanes are cold.
      if (a.type === 'video') {
        const held = clipFilesRef.current.get(a.url);
        if (held) {
          const url = URL.createObjectURL(held);
          const meta = await videoMetaOf(url);
          if (meta) {
            insertClipCore(url, Math.round(meta.dur * 100) / 100, at, held, meta, a.sig);
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
            insertClipCore(twin.src!, Math.round(dur * 100) / 100, at, clipFilesRef.current.get(twin.src!), null, a.sig);
            return;
          }
        }
      }
      // Local asset with a sig: reuse the on-device file (native handle / OPFS) — zero-copy, original
      // identity kept (srcSig === panel sig), no fetch. Falls through to the byte-fetch lane on a miss.
      if (a.type === 'video' && a.sig) {
        const f = await loadLocalVideo(a.sig);
        if (f) {
          const url = URL.createObjectURL(f);
          const meta = await videoMetaOf(url);
          if (meta) {
            insertClipCore(url, Math.round(meta.dur * 100) / 100, at, f, meta, a.sig);
            return;
          }
          URL.revokeObjectURL(url);
        }
      }
      let blob: Blob | null = null;
      try {
        const r = await fetch(a.url);
        if (r.ok) blob = await r.blob();
      } catch {
        /* CORS/network → proxy fallback */
      }
      // blob:/data: URLs are document-local — the server proxy can never fetch them. A dead blob here
      // means the local bytes are gone on every lane (handle/OPFS missed above too): say so precisely.
      const local = a.url.startsWith('blob:') || a.url.startsWith('data:');
      if (!blob && !local) {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(a.url)}`).catch(() => null);
        if (r?.ok) blob = await r.blob();
      }
      if (!blob) {
        toast.error(t(local ? 'workbench.localAssetUnreachable' : 'workbench.couldNotFetchAsset'));
        return;
      }
      if (a.type === 'video') {
        // Fetch-lane insert must not mint a new identity: when the panel told us the sig and the
        // bytes match, alignFileToSig rebuilds the File under that SAME name/mtime (otherwise the
        // panel would show the same file twice — track card + import card — after refresh).
        const name = `clip-${(a.label || 'video').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'video'}.mp4`;
        let f = new File([blob], name, { type: blob.type || 'video/mp4', lastModified: 0 });
        if (a.sig) f = alignFileToSig(f, a.sig);
        const url = URL.createObjectURL(f);
        const meta = await videoMetaOf(url);
        if (!meta) {
          URL.revokeObjectURL(url);
          toast.error(t('workbench.couldNotReadDuration'));
          return;
        }
        void saveLocalVideo(f, fileSig(f)).catch(() => {});
        insertClipCore(url, Math.round(meta.dur * 100) / 100, at, f, meta, a.sig);
      } else {
        const f = await stillClipFromImage(blob, a.label);
        if (!f) {
          toast.error(t('workbench.couldNotConvertImage'));
          return;
        }
        const url = URL.createObjectURL(f);
        if (a.sig) {
          // One asset, one identity: the shot records the IMAGE's sig (panel dedupe holds — no
          // phantom "5s video" card); the image bytes persist through the local handle/OPFS only,
          // and recovery re-derives the still clip from them.
          const img = alignFileToSig(new File([blob], 'image', { type: blob.type, lastModified: 0 }), a.sig);
          void saveLocalVideo(img, a.sig).catch(() => {});
          insertClipCore(url, STILL_CLIP_SEC, at, f, a.dims ? { w: a.dims.w, h: a.dims.h } : null, a.sig);
        } else {
          void saveLocalVideo(f, fileSig(f)).catch(() => {});
          insertClipCore(url, STILL_CLIP_SEC, at, f, a.dims ? { w: a.dims.w, h: a.dims.h } : null);
        }
      }
    } finally {
      setClipPending(null);
    }
  };
  /** Shot-boundary "+": pick a local video or image → insert at that split point. Images become
   *  5-second still clips, matching library-drop semantics. Source bytes stay local. */
  const insertLocalClipAt = async (at: number) => {
    const sourceFile = await pickFile('video/*,image/*');
    if (!sourceFile) return;
    setClipPending(at);
    try {
      const isImage = sourceFile.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(sourceFile.name);
      const sig = fileSig(sourceFile);
      const playbackFile = isImage ? await stillClipFromImage(sourceFile, sourceFile.name) : sourceFile;
      if (!playbackFile) {
        toast.error(t('workbench.couldNotConvertImage'));
        return;
      }
      const url = URL.createObjectURL(playbackFile);
      const meta = await videoMetaOf(url);
      if (!meta) {
        URL.revokeObjectURL(url);
        toast.error(t('workbench.couldNotReadDuration'));
        return;
      }
      void saveLocalVideo(sourceFile, sig); // image identity stays the original bytes; restore re-derives its still clip
      insertClipCore(url, Math.round(meta.dur * 100) / 100, at, playbackFile, meta, sig);
    } finally {
      setClipPending(null);
    }
  };
  return { videoDurationOf, insertClipCore, recoverLocalClips, reconnectIndexedSource, insertLibraryClipAt, insertLocalClipAt, clipPending, clipStrips };
}
