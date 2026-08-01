'use client';

/**
 * Generic parked-interaction channel — THE mechanism for every "the user picks/fills something in
 * the chat stream" tool (ask_user options, export settings, future forms). A tool parks with a
 * typed payload; its card renders the UI from that payload and resolves with the user's choice.
 *
 * Contract (all parked-UI tools follow it):
 * - park() registers {kind, payload} and returns a promise; the matching card resolves it.
 * - An AbortSignal (the chat stop button) resolves null → the tool throws its stop receipt.
 * - At most ONE interaction is parked at a time (the chat turn is paused on the tool call).
 * - Cards must NEVER render null while their tool part is awaiting — an invisible card plus a
 *   parked turn reads as "no reply at all" (real incident). Render a disabled state until the
 *   payload registers (usePendingInteraction returns it).
 */

import { useSyncExternalStore } from 'react';

interface Pending {
  id: number;
  kind: string;
  payload: unknown;
  resolve: (value: unknown) => void;
}

let pending: Pending | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = (): void => {
  for (const f of subs) f();
};

/** Park a tool on user input: registers the payload and waits for the card (or abort → null). */
export function parkInteraction<P, R>(kind: string, payload: P, opts?: { signal?: AbortSignal }): Promise<R | null> {
  return new Promise<R | null>((resolve) => {
    const id = ++seq;
    pending = { id, kind, payload, resolve: resolve as (v: unknown) => void };
    emit();
    opts?.signal?.addEventListener(
      'abort',
      () => {
        if (pending?.id === id) {
          pending = null;
          emit();
        }
        resolve(null);
      },
      { once: true },
    );
  });
}

/** Called by the card with the user's choice: resolves the parked tool. */
export function resolveInteraction(value: unknown): void {
  const p = pending;
  if (!p) return;
  pending = null;
  emit();
  p.resolve(value);
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
const snapshot = (): Pending | null => pending;
const server = (): Pending | null => null;

/** The parked payload for a given kind (null = none parked / not yet registered). */
export function usePendingInteraction<P>(kind: string): P | null {
  const p = useSyncExternalStore(subscribe, snapshot, server);
  return p && p.kind === kind ? (p.payload as P) : null;
}
