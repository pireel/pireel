/**
 * Editor document V2 — the neutral timeline substrate underneath Pireel's semantic
 * talking-head workflow.
 *
 * Design rules (modelled after a professional NLE's Timeline -> Track[] -> Clip[] shape):
 *  - the primary track is valid when empty; non-primary tracks are created transactionally with content;
 *  - every placed item has an explicit timeline position;
 *  - media identity lives in the asset manifest, never in a special "main video" field;
 *  - primary narration, managed captions and music are semantic roles, not magic track indexes;
 *  - transcript/scene data remains a first-class Pireel layer above the neutral timeline.
 *
 * Persisted V1 conversion is isolated to the one-shot online migration. Runtime callers receive
 * V2 only; Composition is an explicit, read-only render projection.
 */

export * from './create';
export * from './commands/index';
export * from './caption-transcript-sync';
export * from './frozen-block-vars';
export * from './legacy-projection';
export * from './prune-empty-tracks';
export * from './prune-unused-assets';
export * from './read-model';
export * from './transcript-address';
export * from './render-plan';
export * from './time';
export * from './track-compatibility';
export * from './types';
export * from './validation';
