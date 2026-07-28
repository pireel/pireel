/**
 * Theme stagings, registered by whoever owns them.
 *
 * The engine renders blueprints but cannot look them up: frames depend on the engine, so the
 * engine importing frames would close the cycle. Same shape as the template registry — the frames
 * package registers on import, the engine only resolves.
 *
 * Lookup is by blueprint id alone, not (frame, component). A block stores the id it was made with,
 * so it keeps rendering exactly as authored after the project switches themes — the same promise
 * the props themselves carry. Switching a theme restyles via tokens and changes what NEW blocks
 * may choose; it does not silently restage the old ones.
 */

import type { Blueprint } from '@pireel/studio-kit';

export type { Blueprint };

const byId = new Map<string, Blueprint>();
const byFrame = new Map<string, Blueprint[]>();

/** Register a frame's stagings. Idempotent — re-registering a frame replaces its list. */
export function registerBlueprints(frameId: string, blueprints: Blueprint[]): void {
  const previous = byFrame.get(frameId) ?? [];
  for (const b of previous) byId.delete(b.id);
  byFrame.set(frameId, blueprints);
  for (const b of blueprints) byId.set(b.id, b);
}

/** The blueprint a block was made with. Undefined = render the component's built-in variant, which
 *  is what a block from an unregistered or removed staging must degrade to rather than fail. */
export function getBlueprint(id?: string): Blueprint | undefined {
  return id ? byId.get(id) : undefined;
}

/** A frame's stagings, optionally narrowed to one component. */
export function frameBlueprints(frameId?: string, component?: string): Blueprint[] {
  const list = frameId ? (byFrame.get(frameId) ?? []) : [];
  return component ? list.filter((b) => b.component === component) : list;
}
