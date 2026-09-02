/**
 * Narration-denoise orchestration (main source, v1): watches comp.audioDenoise, bakes on demand,
 * and keeps the engine's dub channel + the export substitution payload in sync.
 *
 * Bake ladder (each step cached, so knob turns never repeat inference):
 *   extractAudio(videoFile)  →  dry PCM (decode 48k mono)
 *   dry → RNNoise wet PCM     →  wet WAV cached in OPFS by source sig (`dnwet:<sig>`)
 *   dry + wet @ strength      →  blended WAV (in-memory File; rebuilt in seconds on strength change)
 * The blended file is what BOTH ends consume: preview via engine.setNarrationDub('main', url),
 * export via the audio-track substitution in client-export. One file, identical sound.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { applyEditorCommand, type Composition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { toast } from '@pireel/ui/toast';
import type { VideoTrackEngine } from './video-track-engine';
import { DENOISE_DEFAULT_MODE, DENOISE_RATE, blendPcm, decodeMono48k, denoiseWetPcm, encodeWavMono, type DenoiseMode } from './denoise';
import { decodeVideoAudio, toMono } from './audio-decode';
import { fileSig } from './media';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { t } from './i18n';
import { editorErrorMessage } from './editor-error';

export interface DenoiseDeps {
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2) => void;
  videoFile: File | null;
  videoFileRef: MutableRefObject<File | null>;
  videoSigRef: MutableRefObject<string | null>;
  videoEngineRef: MutableRefObject<VideoTrackEngine | null>;
  /** Source url → File, as mounted for playback: identifies which segment keys carry the main file. */
  clipFilesRef: MutableRefObject<Map<string, File>>;
  pushUndoSnapshot: () => void;
}

export function useDenoise(deps: DenoiseDeps) {
  const { comp, compRef, documentRef, setDocument, videoFile, videoFileRef, videoSigRef, videoEngineRef, clipFilesRef, pushUndoSnapshot } = deps;
  const [status, setStatus] = useState<'baking' | 'ready' | 'failed' | null>(null);
  const [progress, setProgress] = useState(0);
  /** Blended output of the last successful bake: what preview plays and export substitutes. */
  const blendedRef = useRef<{ sig: string; strength: number; mode: DenoiseMode; file: File; url: string } | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => () => {
    runIdRef.current += 1;
    const blended = blendedRef.current;
    if (blended) URL.revokeObjectURL(blended.url);
    blendedRef.current = null;
  }, []);

  /** The main narration source = the primary track's first video source. videoFileRef only holds a
   *  file picked in THIS session; after a refresh the source comes back from the local library into
   *  clipFilesRef under its src url, so the composition — not the legacy ref — is the authority. */
  const mainSource = (): { file: File; sig: string; urls: string[] } | null => {
    const shots = compRef.current.shots ?? [];
    // Prefer a shot whose own sound is in the mix (the recording being cleaned); muted montage
    // picture is only a last resort so a legacy single-source project still resolves.
    const mounted = shots.filter((shot) => shot.src && clipFilesRef.current.has(shot.src));
    const lead = mounted.find((shot) => !shot.audioMuted) ?? mounted[0];
    if (lead?.src) {
      const file = clipFilesRef.current.get(lead.src)!;
      const urls = [...clipFilesRef.current.entries()].filter(([, candidate]) => candidate === file).map(([url]) => url);
      return { file, sig: lead.srcSig ?? fileSig(file), urls };
    }
    const f = videoFileRef.current;
    if (!f) return null;
    const urls = [...clipFilesRef.current.entries()].filter(([, candidate]) => candidate === f).map(([url]) => url);
    return { file: f, sig: videoSigRef.current ?? fileSig(f), urls };
  };
  const srcSig = (): string | null => mainSource()?.sig ?? null;
  /** Playback keys the main file is mounted under. Segments are keyed by their source url in the
   *  multi-source model ('main' only for legacy single-source shots), so the dub must be registered
   *  under every url that resolves to this file — a dub under 'main' alone never plays. */
  const playbackKeys = (): string[] => ['main', ...(mainSource()?.urls ?? [])];
  /** Export rigs are keyed 'main' for src-less shots and clip_<shotId> per src-bearing shot. */
  const exportKeys = (): string[] => {
    const urls = new Set(playbackKeys());
    const shots = compRef.current.shots ?? [];
    return ['main', ...shots.filter((shot) => shot.src && urls.has(shot.src)).map((shot) => `clip_${shot.id}`)];
  };
  const dubKeysRef = useRef<string[]>([]);
  const setDub = (url: string | null) => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    const keys = url ? playbackKeys() : dubKeysRef.current;
    for (const key of new Set([...dubKeysRef.current, ...keys])) eng.setNarrationDub(key, keys.includes(key) ? url : null);
    dubKeysRef.current = url ? keys : [];
  };

  const bake = async (strength: number, mode: DenoiseMode, runId: number) => {
    const source = mainSource();
    if (!source) {
      setStatus('failed');
      toast.error(t('workbench.denoiseNeedsMainSource'));
      return;
    }
    const f = source.file;
    const sig = source.sig;
    const cached = blendedRef.current;
    if (cached && cached.sig === sig && cached.strength === strength && cached.mode === mode) {
      setStatus('ready');
      return;
    }
    setStatus('baking');
    setProgress(0);
    try {
      const dryBuf = await decodeVideoAudio(f);
      if (runId !== runIdRef.current) return;
      if (!dryBuf) throw new Error('source has no audio track');
      const dry = await toMono(dryBuf, DENOISE_RATE);
      if (runId !== runIdRef.current) return;
      // wet: OPFS cache by source sig (+ mode) — inference runs once per source ever
      const wetKey = mode === 'strong' ? `dnwet:${sig}` : `dnwet:${mode}:${sig}`;
      let wet: Float32Array | null = null;
      const wetCached = await loadLocalVideo(wetKey);
      if (wetCached) wet = await decodeMono48k(wetCached);
      if (!wet) {
        wet = await denoiseWetPcm(dry, (p) => {
          if (runId === runIdRef.current) setProgress(p);
        }, mode);
        if (runId !== runIdRef.current) return;
        void saveLocalVideo(new File([encodeWavMono(wet)], 'wet.wav', { type: 'audio/wav' }), wetKey);
      }
      if (runId !== runIdRef.current) return;
      const blendedFile = new File([encodeWavMono(blendPcm(dry, wet, strength))], 'denoised.wav', { type: 'audio/wav' });
      const prev = blendedRef.current;
      if (prev) URL.revokeObjectURL(prev.url);
      blendedRef.current = { sig, strength, mode, file: blendedFile, url: URL.createObjectURL(blendedFile) };
      setStatus('ready');
    } catch (e) {
      if (runId !== runIdRef.current) return;
      console.warn('[denoise] bake failed', e);
      const previous = blendedRef.current;
      if (previous) URL.revokeObjectURL(previous.url);
      blendedRef.current = null;
      setStatus('failed');
      toast.error(t('workbench.denoiseFailed'));
    }
  };

  // Watch the comp knob: on → ensure a bake for (sig, strength); off → drop the dub, sound returns to the element.
  const strength = comp.audioDenoise?.strength ?? null;
  const mode: DenoiseMode = comp.audioDenoise?.mode ?? DENOISE_DEFAULT_MODE;
  // Re-bake when the lead source changes (restore mounted it after the knob was already on).
  const leadSrc = (comp.shots ?? []).find((shot) => shot.src)?.src ?? null;
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (strength == null) {
      setStatus(null);
      setDub(null);
      return;
    }
    void bake(strength, mode, runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength, mode, videoFile, leadSrc]);

  // Feed the engine once a blend is ready (status flips drive this; failure keeps the original audio — honest degrade).
  useEffect(() => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    const b = blendedRef.current;
    if (strength != null && status === 'ready' && b) setDub(b.url);
    else if (strength == null || status === 'failed') setDub(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, strength]);

  /** Export substitution payload: source key → blended audio file. Null when off/not ready
   *  (not-ready export keeps original audio; the panel shows baking state so this is visible). */
  const denoiseForExport = (): Map<string, File> | null => {
    const b = blendedRef.current;
    const on = compRef.current.audioDenoise?.strength != null;
    if (!on || !b || b.sig !== srcSig() || b.strength !== compRef.current.audioDenoise!.strength || b.mode !== (compRef.current.audioDenoise!.mode ?? DENOISE_DEFAULT_MODE)) return null;
    return new Map(exportKeys().map((key) => [key, b.file] as const));
  };

  /** Panel/agent entry: strength = turn on / retune (0 < s ≤ 1), null = off; mode defaults to the
   *  current one (or light) so a strength retune never silently switches engines. */
  const setDenoise = (s: number | null, nextMode?: DenoiseMode) => {
    const command = applyEditorCommand(documentRef.current, {
      type: 'processing.patch',
      patch: {
        audioDenoise: s == null
          ? undefined
          : { strength: Math.round(Math.max(0.05, Math.min(1, s)) * 100) / 100, mode: nextMode ?? documentRef.current.processing?.audioDenoise?.mode ?? DENOISE_DEFAULT_MODE },
      },
    });
    if (!command.ok) {
      toast.error(editorErrorMessage(command.error));
      return;
    }
    pushUndoSnapshot();
    setDocument(command.document);
  };

  return { status, progress, denoiseForExport, setDenoise };
}
