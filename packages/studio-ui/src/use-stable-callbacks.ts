'use client';

/**
 * Wrap a set of callbacks that are rebuilt every render into **identity-stable** wrappers (internally
 * routed through a ref so they always call the latest implementation).
 *
 * Purpose: feed callback props to heavy React.memo children (timeline/chat) — the implementations can
 * freely rebuild with the latest state/closures while the wrapper identity stays fixed, so memo's shallow
 * compare can actually block unrelated re-renders.
 * The key set must be fixed (locked in on first render); a new callback = a new key, never add/remove conditionally.
 */

import { useRef, useState } from 'react';

/** A generic callback map must accept any signature — any is the right tool here. */
type AnyFnMap = Record<string, (...args: any[]) => any>;

export function useStableCallbacks<T extends AnyFnMap>(impl: T): T {
  const ref = useRef(impl);
  ref.current = impl;
  const [stable] = useState(() => {
    const out = {} as AnyFnMap;
    for (const key of Object.keys(impl)) {
      out[key] = (...args) => ref.current[key]!(...args);
    }
    return out as T;
  });
  return stable;
}
