'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { Composition, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { StudioProjectOutputSnapshot } from '@pireel/studio-engine/project-outputs';
import type { StudioDraft } from './use-draft-persist';
import { outputSwitchVideoPickOptions, type VideoPickOptions } from './video-pick-feedback';

/** Reconnects browser-only media when the checked-out deliverable changes. The project-output
 * controller owns persisted snapshots; this hook owns the intentionally separate runtime layer. */
export function useProjectOutputRuntime(deps: {
  projectId: string;
  /** Read through the synchronous project-output ref. Chained agent tools can run before React
   * commits the render that follows create_output or switch_output. */
  getActiveId: () => string;
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
  const switchingRef = useRef(false);

  const switchOutput = useCallback(
    async (id: string): Promise<boolean> => {
      if (switchingRef.current || id === deps.getActiveId()) return false;
      switchingRef.current = true;
      setSwitching(true);
      const previousSig = deps.videoSigRef.current;
      const previousFile = deps.videoFileRef.current;
      try {
        const target = deps.switchTo(id);
        if (!target) return false;

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
        deps.pendingRestoreRef.current = null;
        deps.videoSigRef.current = null;
        deps.setVideoFile(null);
        await deps.recoverLocalClips(shots);
        return true;
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [deps],
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
      if (id === deps.getActiveId()) {
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
