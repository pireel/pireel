'use client';

/**
 * Live tool progress (external store) — long-running tools show live text + a progress bar in the chat card.
 * Tools execute in the workbench (runStudioTool) but display in StudioChat's ToolCard, with no direct prop link;
 * a lightweight store decouples them: the execution side calls setToolProgress / clearToolProgress, the display
 * side calls useToolProgress(id).
 *
 * **Multi-slot**: stored per tool id — the agent may run several tools in parallel in one step (e.g.
 * analyze transcript ‖ analyze visuals), so each card reads its own progress without clobbering the others.
 */

import { useSyncExternalStore } from 'react';

export interface ToolProgress {
  /** The running tool's id (shown only when it matches ToolCard's def.id) */
  id: string;
  /** Friendly text, e.g. "Analyzing visuals 42% · ~12s left" */
  text: string;
  /** 0..1 progress; draws a bar when present */
  frac?: number;
}

let map: Record<string, ToolProgress> = {};
const subs = new Set<() => void>();
const emit = () => {
  for (const f of subs) f();
};

export function setToolProgress(p: ToolProgress | null): void {
  if (p === null) {
    // Legacy call compat: clear everything (new code should use clearToolProgress(id))
    map = {};
  } else {
    map = { ...map, [p.id]: p };
  }
  emit();
}

export function clearToolProgress(id: string): void {
  if (!(id in map)) return;
  const next = { ...map };
  delete next[id];
  map = next;
  emit();
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

const snapshot = (): Record<string, ToolProgress> => map;
const empty: Record<string, ToolProgress> = {};
const server = (): Record<string, ToolProgress> => empty;

/** Subscribe to a tool's progress (returns null when not running). */
export function useToolProgress(id: string): ToolProgress | null {
  const m = useSyncExternalStore(subscribe, snapshot, server);
  return m[id] ?? null;
}
