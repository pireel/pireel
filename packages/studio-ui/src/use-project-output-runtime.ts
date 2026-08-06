'use client';

import { useCallback, useState, type MutableRefObject, type SetStateAction } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import type { StudioProjectOutputSnapshot } from '@pireel/studio-engine/project-outputs';
import { loadLocalVideo } from './local-media';
import type { StudioDraft } from './use-draft-persist';

type SetComposition = (action: SetStateAction<Composition>) => void;

/** Reconnects browser-only media when the checked-out deliverable changes. The project-output
 * controller owns persisted snapshots; this hook owns the intentionally separate runtime layer. */
export function useProjectOutputRuntime(deps: {
  projectId: string;
  activeId: string;
  switchTo: (id: string) => StudioProjectOutputSnapshot | null;
  duplicate: (title: string, skill?: string) => StudioProjectOutputSnapshot;
  setComp: SetComposition;
  videoFileRef: MutableRefObject<File | null>;
  videoSigRef: MutableRefObject<string | null>;
  coverThumbRef: MutableRefObject<string | null>;
  pendingRestoreRef: MutableRefObject<StudioDraft | null>;
  setVideoFile: (file: File | null) => void;
  pickVideoFile: (file: File, opts?: { asSig?: string; reconnect?: boolean }) => Promise<void>;
  recoverLocalClips: (shots: NonNullable<Composition['shots']>) => Promise<void> | void;
  resetEditor: () => void;
}) {
  const [switching, setSwitching] = useState(false);

  const switchOutput = useCallback(
    async (id: string): Promise<boolean> => {
      if (switching || id === deps.activeId) return false;
      const previousSig = deps.videoSigRef.current;
      const previousFile = deps.videoFileRef.current;
      const target = deps.switchTo(id);
      if (!target) return false;

      setSwitching(true);
      deps.resetEditor();
      deps.coverThumbRef.current = target.coverThumb;
      const draft: StudioDraft = {
        id: deps.projectId,
        comp: target.comp,
        videoSig: target.videoSig,
        videoDurationSec: target.videoDurationSec,
        ...(target.coverThumb ? { coverThumb: target.coverThumb } : {}),
        savedAt: Date.now(),
      };
      deps.pendingRestoreRef.current = draft;
      deps.setComp({ ...target.comp, video: null });

      const shots = target.comp.shots ?? [];
      const wantsMain = shots.some((shot) => !shot.src) || (!shots.length && target.videoDurationSec != null);
      try {
        if (wantsMain && target.videoSig) {
          deps.videoSigRef.current = target.videoSig;
          const file = previousSig === target.videoSig && previousFile ? previousFile : await loadLocalVideo(target.videoSig);
          if (file) await deps.pickVideoFile(file, { asSig: target.videoSig, reconnect: true });
          else deps.setVideoFile(null);
        } else {
          deps.pendingRestoreRef.current = null;
          deps.videoSigRef.current = null;
          deps.setVideoFile(null);
        }
        await deps.recoverLocalClips(shots);
        return true;
      } finally {
        setSwitching(false);
      }
    },
    [deps, switching],
  );

  const duplicateOutput = useCallback(
    (title: string, skill?: string) => {
      const target = deps.duplicate(title, skill);
      deps.resetEditor();
      return target;
    },
    [deps],
  );

  return { switching, switchOutput, duplicateOutput };
}
