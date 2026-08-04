/**
 * Editor document V2 — the neutral timeline substrate underneath Pireel's semantic
 * talking-head workflow.
 *
 * Design rules (modelled after a professional NLE's Timeline -> Track[] -> Clip[] shape):
 *  - tracks and clips are valid when empty; no media kind is required for the document to exist;
 *  - every placed item has an explicit timeline position;
 *  - media identity lives in the asset manifest, never in a special "main video" field;
 *  - primary narration, managed captions and music are semantic roles, not magic track indexes;
 *  - transcript/scene data remains a first-class Pireel layer above the neutral timeline.
 *
 * V1 compatibility is deliberately a boundary concern. Migration creates the sole in-memory
 * source of truth; the legacy projection is temporary and read-only.
 */

export * from './create';
export * from './commands/index';
export * from './caption-transcript-sync';
export * from './frozen-block-vars-sync';
export * from './legacy-projection';
export * from './legacy-edit-merge';
export * from './migration';
export * from './render-plan';
export * from './time';
export * from './types';
export * from './validation';
