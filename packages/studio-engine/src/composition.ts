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

import { ensureTemplatesRegistered } from './templates';

// Re-export order is not an execution-order guarantee once the production bundler
// tree-shakes this barrel. Keep a live reference to the registration module so any
// consumer of the public composition entry can safely call blockKind/renderBlock.
ensureTemplatesRegistered();

export * from './audio-tracks';
export * from './caption-presets';
export * from './caption-layout-metrics';
export * from './caption-layout-state';
export * from './composition-core';
export * from './source-framing';
export * from './visual-layer-plan';
export * from './receipt-delta';
export * from './editing-primitives';
export * from './editor-document';
export * from './canvas-document-edit';
export * from './narration-document-edit';
export * from './overlay-document-edit';
export * from './overlay-track-edit';
export * from './layout-document-edit';
export * from './audio-document-edit';
export * from './agent-timeline';
export * from './caption-document-edit';
export * from './narrative-document-edit';
export * from './visual-document-edit';
export * from './media-framing-edit';
export * from './media-video-edit';
export * from './generated-draft-document-edit';
export * from './project-document';
export * from './transcript-address';
export * from './transcript-context';
export * from './local-asset-locator';
export * from './templates';
export * from './assemble';
export * from './block-factory';
