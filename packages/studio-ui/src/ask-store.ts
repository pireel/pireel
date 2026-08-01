'use client';

/**
 * ask_user channel — the tool executes in the workbench (runStudioTool) but its UI (option chips)
 * renders in the chat card, with no direct link between them. Mirror of tool-progress: the tool
 * registers a resolver and its promise parks until the card calls answerCurrentAsk on a click.
 *
 * At most ONE ask is live at a time — the chat turn is paused awaiting onToolCall, so there is
 * exactly one pending question. The card reads hasPendingAsk() to enable its chips only once the
 * resolver is actually registered (closing the microscopic window between the card mounting in
 * input-available state and runStudioTool registering).
 */

import { useSyncExternalStore } from 'react';

type Answer = (selection: string[] | null) => void;

let pending: { id: number; answer: Answer } | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = (): void => {
  for (const f of subs) f();
};

/** Called by runStudioTool when ask_user starts; returns an unregister (used on abort). */
export function registerAsk(answer: Answer): () => void {
  const id = ++seq;
  pending = { id, answer };
  emit();
  return () => {
    if (pending?.id === id) {
      pending = null;
      emit();
    }
  };
}

/** Called by the chat card on a click: resolves the parked tool promise with the chosen labels. */
export function answerCurrentAsk(selection: string[]): void {
  const p = pending;
  if (!p) return;
  pending = null;
  emit();
  p.answer(selection);
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
const snapshot = (): boolean => pending !== null;
const server = (): boolean => false;

/** True while a question is awaiting an answer (the card enables its chips only then). */
export function useHasPendingAsk(): boolean {
  return useSyncExternalStore(subscribe, snapshot, server);
}
