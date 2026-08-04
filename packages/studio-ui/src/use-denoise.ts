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
import { DENOISE_RATE, blendPcm, decodeMono48k, denoiseWetPcm, encodeWavMono } from './denoise';
import { decodeVideoAudio, toMono } from './audio-decode';
import { fileSig } from './media';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { t } from './i18n';

export interface DenoiseDeps {
  comp: Composition;
  compRef: MutableRefObject<Composition>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2) => void;
  videoFileRef: MutableRefObject<File | null>;
  videoSigRef: MutableRefObject<string | null>;
  videoEngineRef: MutableRefObject<VideoTrackEngine | null>;
  pushUndoSnapshot: () => void;
}

export function useDenoise(deps: DenoiseDeps) {
  const { comp, compRef, documentRef, setDocument, videoFileRef, videoSigRef, videoEngineRef, pushUndoSnapshot } = deps;
  const [status, setStatus] = useState<'baking' | 'ready' | 'failed' | null>(null);
  const [progress, setProgress] = useState(0);
  /** Blended output of the last successful bake: what preview plays and export substitutes. */
  const blendedRef = useRef<{ sig: string; strength: number; file: File; url: string } | null>(null);
  const runIdRef = useRef(0);

  const srcSig = (): string | null => {
    const f = videoFileRef.current;
    return f ? (videoSigRef.current ?? fileSig(f)) : null;
  };

  const bake = async (strength: number, runId: number) => {
    const f = videoFileRef.current;
    const sig = srcSig();
    if (!f || !sig) return;
    const cached = blendedRef.current;
    if (cached && cached.sig === sig && cached.strength === strength) {
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
      // wet: OPFS cache by source sig — inference runs once per source ever
      const wetKey = `dnwet:${sig}`;
      let wet: Float32Array | null = null;
      const wetCached = await loadLocalVideo(wetKey);
      if (wetCached) wet = await decodeMono48k(wetCached);
      if (!wet) {
        wet = await denoiseWetPcm(dry, (p) => {
          if (runId === runIdRef.current) setProgress(p);
        });
        if (runId !== runIdRef.current) return;
        void saveLocalVideo(new File([encodeWavMono(wet)], 'wet.wav', { type: 'audio/wav' }), wetKey);
      }
      if (runId !== runIdRef.current) return;
      const blendedFile = new File([encodeWavMono(blendPcm(dry, wet, strength))], 'denoised.wav', { type: 'audio/wav' });
      const prev = blendedRef.current;
      if (prev) URL.revokeObjectURL(prev.url);
      blendedRef.current = { sig, strength, file: blendedFile, url: URL.createObjectURL(blendedFile) };
      setStatus('ready');
    } catch (e) {
      if (runId !== runIdRef.current) return;
      console.warn('[denoise] bake failed', e);
      blendedRef.current = null;
      setStatus('failed');
      toast.error(t('workbench.denoiseFailed'));
    }
  };

  // Watch the comp knob: on → ensure a bake for (sig, strength); off → drop the dub, sound returns to the element.
  const strength = comp.audioDenoise?.strength ?? null;
  useEffect(() => {
    const runId = ++runIdRef.current;
    if (strength == null) {
      setStatus(null);
      videoEngineRef.current?.setNarrationDub('main', null);
      return;
    }
    void bake(strength, runId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strength, comp.video]);

  // Feed the engine once a blend is ready (status flips drive this; failure keeps the original audio — honest degrade).
  useEffect(() => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    const b = blendedRef.current;
    if (strength != null && status === 'ready' && b) eng.setNarrationDub('main', b.url);
    else if (strength == null || status === 'failed') eng.setNarrationDub('main', null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, strength]);

  /** Export substitution payload: source key → blended audio file. Null when off/not ready
   *  (not-ready export keeps original audio; the panel shows baking state so this is visible). */
  const denoiseForExport = (): Map<string, File> | null => {
    const b = blendedRef.current;
    const on = compRef.current.audioDenoise?.strength != null;
    if (!on || !b || b.sig !== srcSig() || b.strength !== compRef.current.audioDenoise!.strength) return null;
    return new Map([['main', b.file]]);
  };

  /** Panel/agent entry: strength = turn on / retune (0 < s ≤ 1), null = off. */
  const setDenoise = (s: number | null) => {
    const command = applyEditorCommand(documentRef.current, {
      type: 'processing.patch',
      patch: { audioDenoise: s == null ? undefined : { strength: Math.round(Math.max(0.05, Math.min(1, s)) * 100) / 100 } },
    });
    if (!command.ok) {
      toast.error(command.error.message);
      return;
    }
    pushUndoSnapshot();
    setDocument(command.document);
  };

  return { status, progress, denoiseForExport, setDenoise };
}
