'use client';

import { useCallback, useState, type MutableRefObject } from 'react';
import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { StudioProjectOutputSnapshot } from '@pireel/studio-engine/project-outputs';
import { loadLocalVideo } from './local-media';
import type { StudioDraft } from './use-draft-persist';
import { outputSwitchVideoPickOptions, type VideoPickOptions } from './video-pick-feedback';

/** Reconnects browser-only media when the checked-out deliverable changes. The project-output
 * controller owns persisted snapshots; this hook owns the intentionally separate runtime layer. */
export function useProjectOutputRuntime(deps: {
  projectId: string;
  activeId: string;
  switchTo: (id: string) => StudioProjectOutputSnapshot | null;
  create: (title: string, skill?: string) => StudioProjectOutputSnapshot;
  listOutputIds: () => string[];
  remove: (id: string) => void;
  setDocument: (document: EditorDocumentV2) => void;
  getComposition: () => Composition;
  onDocumentActivated?: (document: EditorDocumentV2, composition: Composition) => void;
  videoFileRef: MutableRefObject<File | null>;
  videoSigRef: MutableRefObject<string | null>;
  coverThumbRef: MutableRefObject<string | null>;
  pendingRestoreRef: MutableRefObject<StudioDraft | null>;
  setVideoFile: (file: File | null) => void;
  pickVideoFile: (file: File, opts?: VideoPickOptions) => Promise<void>;
  fetchCloudMedia?: (sig: string, cloudKey?: string) => Promise<File | null>;
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
      deps.setDocument(target.document);
      const composition = deps.getComposition();
      deps.onDocumentActivated?.(target.document, composition);
      const draft: StudioDraft = {
        id: deps.projectId,
        document: target.document,
        comp: composition,
        videoSig: target.videoSig,
        videoDurationSec: target.videoDurationSec,
        ...(target.coverThumb ? { coverThumb: target.coverThumb } : {}),
        savedAt: Date.now(),
      };
      deps.pendingRestoreRef.current = draft;

      const shots = composition.shots ?? [];
      const wantsMain = shots.some((shot) => !shot.src) || (!shots.length && target.videoDurationSec != null);
      try {
        const primaryId = target.document.semantics.primaryNarrativeAssetId;
        const mainAsset = primaryId ? target.document.assets[primaryId] : undefined;
        const mainSig = mainAsset?.locator.localSig ?? target.videoSig;
        if (wantsMain && mainSig) {
          deps.videoSigRef.current = mainSig;
          let file = previousSig === mainSig && previousFile ? previousFile : await loadLocalVideo(mainSig);
          if (!file && deps.fetchCloudMedia) file = await deps.fetchCloudMedia(mainSig, mainAsset?.locator.cloudKey);
          if (file) await deps.pickVideoFile(file, outputSwitchVideoPickOptions(mainSig));
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

  const createOutput = useCallback(
    (title: string, skill?: string) => {
      const target = deps.create(title, skill);
      deps.resetEditor();
      deps.coverThumbRef.current = null;
      deps.pendingRestoreRef.current = null;
      deps.videoSigRef.current = null;
      deps.setVideoFile(null);
      deps.setDocument(target.document);
      const composition = deps.getComposition();
      deps.onDocumentActivated?.(target.document, composition);
      return target;
    },
    [deps],
  );

  const deleteOutput = useCallback(
    async (id: string): Promise<boolean> => {
      const ids = deps.listOutputIds();
      const index = ids.indexOf(id);
      if (index < 0 || ids.length <= 1) return false;
      if (id === deps.activeId) {
        const fallbackId = ids[index + 1] ?? ids[index - 1];
        if (!fallbackId || !(await switchOutput(fallbackId))) return false;
      }
      deps.remove(id);
      return true;
    },
    [deps, switchOutput],
  );

  return { switching, switchOutput, createOutput, deleteOutput };
}
