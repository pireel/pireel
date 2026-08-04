'use client';

import { type MutableRefObject, type SetStateAction, useCallback, useRef, useState } from 'react';
import type { Composition, EditorCommand, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import {
  applyCommandToLiveProject,
  applyCompositionToLiveProject,
  applyDocumentToLiveProject,
  createLiveProjectDocumentSession,
  documentFromLiveComposition,
  resolveLiveAssetUrl,
  type LiveProjectDocumentState,
  type LiveProjectMigrationContext,
} from './live-project-document';

export interface UseLiveProjectDocumentOptions {
  projectId: string;
  initialComposition: Composition;
  migrationContextRef: MutableRefObject<LiveProjectMigrationContext>;
  prepareComposition?: (composition: Composition) => Composition;
}

export function useLiveProjectDocument(options: UseLiveProjectDocumentOptions) {
  const { projectId, initialComposition, migrationContextRef, prepareComposition } = options;
  const sessionRef = useRef<ReturnType<typeof createLiveProjectDocumentSession> | null>(null);
  if (!sessionRef.current) sessionRef.current = createLiveProjectDocumentSession(projectId, initialComposition);
  const [state, setState] = useState<LiveProjectDocumentState>(sessionRef.current.state);
  const compositionRef = useRef(state.composition);
  const documentRef = useRef(state.document);

  const publish = useCallback((next: LiveProjectDocumentState) => {
    sessionRef.current!.state = next;
    compositionRef.current = next.composition;
    documentRef.current = next.document;
    setState(next);
  }, []);

  const setComposition = useCallback((action: SetStateAction<Composition>) => {
    const current = compositionRef.current;
    const candidate = typeof action === 'function' ? (action as (value: Composition) => Composition)(current) : action;
    const composition = prepareComposition ? prepareComposition(candidate) : candidate;
    publish(applyCompositionToLiveProject(sessionRef.current!, composition, migrationContextRef.current));
  }, [migrationContextRef, prepareComposition, publish]);

  const setDocument = useCallback((document: EditorDocumentV2, runtimeComposition?: Composition) => {
    publish(applyDocumentToLiveProject(sessionRef.current!, document, runtimeComposition));
  }, [publish]);

  const persistableDocument = useCallback((composition: Composition) => (
    documentFromLiveComposition(sessionRef.current!, composition, migrationContextRef.current)
  ), [migrationContextRef]);

  const dispatchCommand = useCallback((command: EditorCommand) => {
    const result = applyCommandToLiveProject(sessionRef.current!, command);
    if (result.ok) publish(sessionRef.current!.state);
    return result;
  }, [publish]);

  const resolveAssetUrl = useCallback((asset: Parameters<typeof resolveLiveAssetUrl>[1]) => (
    resolveLiveAssetUrl(sessionRef.current!, asset)
  ), []);

  return {
    composition: state.composition,
    compositionRef,
    document: state.document,
    documentRef,
    setComposition,
    setDocument,
    dispatchCommand,
    resolveAssetUrl,
    persistableDocument,
  };
}
