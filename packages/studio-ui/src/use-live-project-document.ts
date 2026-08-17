'use client';

import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import type { Composition, EditorCommand, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import {
  applyCommandToLiveProject,
  applyDocumentToLiveProject,
  createLiveProjectDocumentSession,
  persistableLiveProjectDocument,
  rememberLiveAssetUrl,
  resolveLiveAssetUrl,
  type LiveProjectDocumentState,
  type LiveProjectPersistenceMetadata,
} from './live-project-document';

export interface UseLiveProjectDocumentOptions {
  projectId: string;
  initialComposition: Composition;
  persistenceMetadataRef: MutableRefObject<LiveProjectPersistenceMetadata>;
}

export function useLiveProjectDocument(options: UseLiveProjectDocumentOptions) {
  const { projectId, initialComposition, persistenceMetadataRef } = options;
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

  const setDocument = useCallback((document: EditorDocumentV2, runtimeComposition?: Composition) => {
    publish(applyDocumentToLiveProject(sessionRef.current!, document, runtimeComposition));
  }, [publish]);

  const persistableDocument = useCallback((stripManagedCaptions = false) => (
    persistableLiveProjectDocument(sessionRef.current!, persistenceMetadataRef.current, { stripManagedCaptions })
  ), [persistenceMetadataRef]);

  const dispatchCommand = useCallback((command: EditorCommand) => {
    const result = applyCommandToLiveProject(sessionRef.current!, command);
    if (result.ok) publish(sessionRef.current!.state);
    return result;
  }, [publish]);

  const resolveAssetUrl = useCallback((asset: Parameters<typeof resolveLiveAssetUrl>[1]) => (
    resolveLiveAssetUrl(sessionRef.current!, asset)
  ), []);

  const rememberAssetUrl = useCallback((assetId: string, url: string) => {
    rememberLiveAssetUrl(sessionRef.current!, assetId, url);
  }, []);

  const clearRuntimeAssetUrls = useCallback(() => {
    sessionRef.current!.runtimeAssetUrls.clear();
  }, []);

  return {
    composition: state.composition,
    compositionRef,
    document: state.document,
    documentRef,
    setDocument,
    dispatchCommand,
    resolveAssetUrl,
    rememberAssetUrl,
    clearRuntimeAssetUrls,
    persistableDocument,
  };
}
