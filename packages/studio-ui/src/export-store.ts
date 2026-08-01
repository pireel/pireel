'use client';

/**
 * export settings channel — export_video parks here (like ask-store) until the user picks specs in
 * the export-settings card and hits Export. The tool computes the recommendations, registers them
 * with a resolver; the card reads them via usePendingExport and resolves with the chosen values.
 * One export is being configured at a time (the chat turn is paused on the tool call).
 */

import { useSyncExternalStore } from 'react';
import type { ExportRecommendations } from '@pireel/studio-engine/export-options';

export interface ExportChoice {
  resolution: number;
  fps: number;
  format: 'mp4' | 'webm' | 'mov';
}

type Resolve = (choice: ExportChoice | null) => void;

let pending: { id: number; rec: ExportRecommendations; resolve: Resolve } | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = (): void => {
  for (const f of subs) f();
};

/** Called by runStudioTool when export_video parks; returns an unregister (used on abort). */
export function registerExportChoice(rec: ExportRecommendations, resolve: Resolve): () => void {
  const id = ++seq;
  pending = { id, rec, resolve };
  emit();
  return () => {
    if (pending?.id === id) {
      pending = null;
      emit();
    }
  };
}

/** Called by the card's Export button: resolves the parked tool with the chosen specs. */
export function resolveExportChoice(choice: ExportChoice): void {
  const p = pending;
  if (!p) return;
  pending = null;
  emit();
  p.resolve(choice);
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
const snapshot = (): ExportRecommendations | null => pending?.rec ?? null;
const server = (): ExportRecommendations | null => null;

/** The recommendations for the export being configured, or null when none is parked. */
export function usePendingExport(): ExportRecommendations | null {
  return useSyncExternalStore(subscribe, snapshot, server);
}
