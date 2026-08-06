'use client';

import { useCallback, useRef, useState } from 'react';
import {
  createProjectOutputs,
  deleteInactiveProjectOutput,
  duplicateProjectOutput,
  normalizeProjectOutputs,
  renameProjectOutput,
  switchProjectOutput,
  type ActiveProjectOutputState,
  type StudioProjectOutputSnapshot,
  type StudioProjectOutputs,
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

  const duplicate = useCallback(
    (title: string, skill?: string): StudioProjectOutputSnapshot => {
      const result = duplicateProjectOutput(outputsRef.current, getActiveState(), title, skill);
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

  return { outputs, outputsRef, hydrate, switchTo, duplicate, rename, remove };
}
