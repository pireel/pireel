'use client';

import { useCallback, useRef, useState } from 'react';
import {
  createBlankProjectOutput,
  createProjectOutputs,
  deleteInactiveProjectOutput,
  duplicateActiveProjectOutput,
  normalizeProjectOutputs,
  renameProjectOutput,
  resolveProjectOutputId,
  switchProjectOutput,
  type ActiveProjectOutputState,
  type StudioProjectOutputSnapshot,
  type StudioProjectOutputs,
  type ProjectOutputReference,
} from '@pireel/studio-engine/project-outputs';

/** State-only controller for a project's deliverables. Runtime video reconnection belongs to the
 * workbench; keeping it outside this hook makes output persistence independently testable. */
export function useProjectOutputs(getActiveState: () => ActiveProjectOutputState) {
  const [outputs, setOutputsState] = useState<StudioProjectOutputs>(() => createProjectOutputs());
  const outputsRef = useRef(outputs);
  outputsRef.current = outputs;

  const setOutputs = useCallback((next: StudioProjectOutputs) => {
    outputsRef.current = next;
    setOutputsState(next);
  }, []);

  const hydrate = useCallback(
    (value: unknown) => {
      const next = normalizeProjectOutputs(value);
      setOutputs(next);
      return next;
    },
    [setOutputs],
  );

  const switchTo = useCallback(
    (id: string): StudioProjectOutputSnapshot | null => {
      const result = switchProjectOutput(outputsRef.current, getActiveState(), id);
      if (!result) return null;
      setOutputs(result.outputs);
      return result.target;
    },
    [getActiveState, setOutputs],
  );

  const create = useCallback(
    (title: string, skill?: string): StudioProjectOutputSnapshot => {
      const result = createBlankProjectOutput(outputsRef.current, getActiveState(), title, skill);
      setOutputs(result.outputs);
      return result.target;
    },
    [getActiveState, setOutputs],
  );

  const duplicate = useCallback(
    (title: string): StudioProjectOutputSnapshot => {
      const result = duplicateActiveProjectOutput(outputsRef.current, getActiveState(), title);
      setOutputs(result.outputs);
      return result.target;
    },
    [getActiveState, setOutputs],
  );

  const rename = useCallback(
    (id: string, title: string) => setOutputs(renameProjectOutput(outputsRef.current, id, title)),
    [setOutputs],
  );

  const remove = useCallback(
    (id: string) => setOutputs(deleteInactiveProjectOutput(outputsRef.current, id)),
    [setOutputs],
  );

  const resolve = useCallback(
    (reference: ProjectOutputReference, defaultToActive = true) => resolveProjectOutputId(outputsRef.current, reference, defaultToActive),
    [],
  );

  return { outputs, outputsRef, hydrate, switchTo, create, duplicate, rename, remove, resolve };
}
