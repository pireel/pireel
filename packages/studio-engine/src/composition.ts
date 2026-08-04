/**
 * Studio composition — the single public entry (barrel).
 *
 * The original 876-line file was split four ways by responsibility; import path
 * stays the same ('@/lib/studio/composition'):
 *   composition-core  types + shot/duration geometry + template registry + shared text helpers (no sibling deps)
 *   templates         built-in template render impls + registration (IMPORT SIDE EFFECT — must run before assemble consumes it,
 *                     guaranteed by this barrel's import order)
 *   assemble          assembleHtml / blockPreviewDoc (assembles the full Hyperframes document)
 *   block-factory     newBlock / mediaBlock / titleBlock … block constructors
 *
 * Don't bypass this entry and import sibling files directly — the registry-ready order is guaranteed here.
 */

export * from './audio-tracks';
export * from './caption-presets';
export * from './composition-core';
export * from './source-framing';
export * from './visual-layer-plan';
export * from './receipt-delta';
export * from './editing-primitives';
export * from './editor-document';
export * from './timeline-ripple';
export * from './narration-document-edit';
export * from './project-document';
export * from './transcript-address';
export * from './templates';
export * from './assemble';
export * from './block-factory';
