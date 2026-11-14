import { useSyncExternalStore } from 'react';
import type { FilmstripFrame } from '@pireel/studio-ui/media';

export type ClipStrips = Readonly<Record<string, FilmstripFrame[]>>;

/**
 * The timeline's filmstrip thumbnails by source, held outside React state. They arrive a few at a
 * time while the timeline scrolls, and each arrival used to be a state update of the whole editor:
 * a fast scroll through a long project rendered the workbench dozens of times for pictures only the
 * timeline draws. The timeline subscribes; nothing else renders.
 */
export interface ClipStripsStore {
  get(): ClipStrips;
  set(next: ClipStrips): void;
  subscribe(listener: () => void): () => void;
}

export function createClipStripsStore(): ClipStripsStore {
  let strips: ClipStrips = {};
  const listeners = new Set<() => void>();
  return {
    get: () => strips,
    set(next) {
      if (next === strips) return;
      strips = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const NO_STRIPS: ClipStrips = {};
const noStore: ClipStripsStore = { get: () => NO_STRIPS, set: () => {}, subscribe: () => () => {} };

/** The strips of a store, rendering the caller again when they change. Without a store: none. */
export function useClipStrips(store: ClipStripsStore | undefined): ClipStrips {
  const from = store ?? noStore;
  return useSyncExternalStore(from.subscribe, from.get, from.get);
}
