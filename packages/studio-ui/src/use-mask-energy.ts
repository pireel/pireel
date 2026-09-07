/**
 * Source envelopes for every clip that carries word masks, so the masked spans can follow the real
 * onset and decay of the voice instead of the ASR alignment cuts. Decoded once per file (by content
 * sig), only for clips that actually have masks; lanes resolve their bytes the same way export does.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import { videoTrackShots } from '@pireel/studio-engine/composition';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import type { AudioEnergy } from '@pireel/studio-engine/word-masks';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';
import { decodeVideoAudio } from './audio-decode';
import { peaksOf } from './audio-peaks';
import { loadExportVideoFile } from './export-visual-media';
import { maskedClipIds } from './export-word-masks';
import { fileSig } from './media';
import type { AudioExportEntry } from './audio-export-payload';

export function useMaskEnergy(deps: {
  document: EditorDocumentV2;
  comp: Composition;
  visualMediaClips: readonly SupplementalVisualMediaClip[] | undefined;
  videoFileRef: MutableRefObject<File | null>;
  clipFilesRef: MutableRefObject<Map<string, File>>;
  audioForExport: () => Promise<AudioExportEntry[] | null>;
}): ReadonlyMap<string, AudioEnergy> {
  const { document, comp, visualMediaClips, videoFileRef, clipFilesRef, audioForExport } = deps;
  const [energy, setEnergy] = useState<ReadonlyMap<string, AudioEnergy>>(new Map());
  const bySigRef = useRef(new Map<string, Promise<AudioEnergy | null>>());
  const clipIds = maskedClipIds(document);
  const clipKey = clipIds.join('\u0000');

  useEffect(() => {
    if (!clipIds.length) {
      setEnergy((prev) => (prev.size ? new Map() : prev));
      return;
    }
    let cancelled = false;
    void (async () => {
      const shots = new Map(videoTrackShots(comp).map((shot) => [shot.id, shot]));
      const visuals = new Map((visualMediaClips ?? []).map((visual) => [visual.clipId, visual]));
      let audioEntries: AudioExportEntry[] | null | undefined;
      const next = new Map<string, AudioEnergy>();
      for (const clipId of clipIds) {
        let file: File | null | undefined;
        const shot = shots.get(clipId);
        if (shot) file = shot.src ? clipFilesRef.current.get(shot.src) : videoFileRef.current;
        else if (visuals.has(clipId)) {
          try {
            file = await loadExportVideoFile(visuals.get(clipId)!.source, clipFilesRef.current);
          } catch {
            file = null;
          }
        } else {
          if (audioEntries === undefined) audioEntries = await audioForExport().catch(() => null);
          file = audioEntries?.find((entry) => entry.clip.id === clipId)?.file;
        }
        if (!file) continue;
        const sig = fileSig(file);
        let pending = bySigRef.current.get(sig);
        if (!pending) {
          pending = decodeVideoAudio(file)
            .then((buf) => (buf ? { peaks: peaksOf(buf), durationSec: buf.duration } : null))
            .catch(() => null);
          bySigRef.current.set(sig, pending);
        }
        const resolved = await pending;
        if (resolved) next.set(clipId, resolved);
      }
      if (cancelled) return;
      setEnergy((prev) => {
        if (prev.size === next.size && [...next].every(([id, value]) => prev.get(id) === value)) return prev;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey, comp, visualMediaClips]);

  return energy;
}
