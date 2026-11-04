import { isCaptionAnimation, CAPTION_ANIMATION_IDS, captionAnimationId } from '@pireel/studio-engine/caption-animations';
import { DEFAULT_TRANSITION_SEC, maxTransitionFrames, transitionSlotAt } from '@pireel/studio-engine/editor-document/transitions';
/**
 * Agent surface v3 — document-level tools in their published shape.
 *
 * Every tool here takes exactly what its schema in agent-surface-v3/schemas.ts describes (integer
 * timeline frames, `clipId`, `[inSec, outSec]` pairs, `items[]`) and returns an AgentTimelineOutcome.
 * They are pure functions of the document, so the same code runs in the studio tab (as an
 * `agent.timeline` transaction op), in the offline executor and in the server's transaction replay.
 * Browser-only concerns (transcribing, rendering frames, visual analysis) live in the tab runner
 * under the same tool names; nothing translates one tool into another any more.
 */

import {
  applyEditorCommand,
  editorTimelineTotalFrames,
  positiveDurationFrames,
  secondsToTimelineFrames,
  timelineFramesToSeconds,
  type EditorCommandReceipt,
  type ClipPipLayout,
  type EditorDocumentV2,
  type TimelineClip,
} from '@pireel/studio-engine/editor-document';
import { CAPTION_PRESETS, getCaptionPreset } from '@pireel/studio-engine/caption-presets';
import { refreshClipPipLayouts, setClipPipLayout } from '@pireel/studio-engine/pip-layout';
import { CUT_TRANSITION_EFFECTS, DIRECTIONAL_TRANSITIONS, MAX_TRANSITION_SEC, PLACE_ANCHORS, SHOT_TREATMENTS, ZOOM_PRESETS, ZOOM_SCALE_MAX, ZOOM_SCALE_MIN, applyBlockPlacement, blockId, blockKind, isSentenceCaption, placementFramingNotes, renderBlock, shotFilterCss, videoShotTimelineSpans, zoneOf, type Block, type Composition, type CutTransitionEffect, type ShotFilter, type TransitionDirection, type VideoShot } from '@pireel/studio-engine/composition-core';
import { applyCanvasDocumentEdit } from '@pireel/studio-engine/canvas-document-edit';
import { applyCaptionDocumentEdit, captionPatchBreaksLines } from '@pireel/studio-engine/caption-document-edit';
import { applyCompositionLayout, applyShotFramingInput, canvasSizeFollowingFirstVideo, canvasSizeFromInput } from '@pireel/studio-engine/editing-primitives';
import { applyLayoutDocumentEdit } from '@pireel/studio-engine/layout-document-edit';
import { applyMediaCropInput, applyMediaTransformInput } from '@pireel/studio-engine/media-framing-edit';
import { applyNarrationDocumentEdit } from '@pireel/studio-engine/narration-document-edit';
import { applyNarrationSplitCommands, normalizeNarrationSplitPoints } from '@pireel/studio-engine/editor-document/commands/narration-split';
import { applyOverlayDocumentEdits, removeOverlayDocumentClips } from '@pireel/studio-engine/overlay-document-edit';
import { applyVideoClipSettingsPatches, mediaVideoClipEntries } from '@pireel/studio-engine/media-video-edit';
import { duplicateOverlayDocumentClip, retimeOverlayDocumentClip } from '@pireel/studio-engine/overlay-track-edit';
import { editorDocumentRenderPlan } from '@pireel/studio-engine/editor-document/render-plan';
import { firstNarrativeAssetId, freeOverlayStackOrder, narrativeAtTimelineSecond, primaryNarrativeClips } from '@pireel/studio-engine/editor-document/read-model';
import { projectNarrativeShots, projectOverlayBlockById } from '@pireel/studio-engine/editor-document/legacy-projection';
import { documentCaptionsOn, documentCaptionStyle } from '@pireel/studio-engine/editor-document/caption-state';
import { clipCapabilityContext, clipFieldRefusal } from '@pireel/studio-engine/agent-surface-v3/clip-properties';
import { listDocumentAddressedWords, resolveDocumentWordIds } from '@pireel/studio-engine/editor-document/transcript-address';
import { patchNarrativeClips } from '@pireel/studio-engine/editor-document/commands/narrative-patch';
import { projectDocumentToComposition } from '@pireel/studio-engine/project-document';
import { STUDIO_AGENT_EXECUTION_LIMITS } from '@pireel/studio-engine/agent-execution-budget';
import { boundCaptionSourceAssetId } from '@pireel/studio-engine/editor-document/commands/managed-captions';
import { type AsrSegment, applyCaptionTranslations, type CaptionTranslationItem, clearCaptionTranslations, desegmentCues } from '@pireel/studio-engine/build-blocks';
import { applyCaptionTextEdits } from '@pireel/studio-engine/caption-text-edit';
import { resolveCaptionSentenceEdits } from '@pireel/studio-engine/caption-sentence-edit';
import { captionYPctForCanvas } from '@pireel/studio-engine/delivery-safety';
import { isDisplayTextFontId } from '@pireel/studio-engine/display-text-presets';
import { resolveWebFontReference, webFontCatalogHint } from '@pireel/studio-engine/font-library';
import { planNarrationScriptSegments, planScriptCaptionSegments, splitScriptLines } from '@pireel/studio-engine/script-captions';
import { narrationRowMarks } from '@pireel/studio-engine/trim';
import { applyWordDecorations, type WordDecorationPatch } from '@pireel/studio-engine/word-decorations';
import { phraseWordIndexes, rowWords } from '@pireel/studio-engine/caption-highlights';
import { joinWords } from '@pireel/studio-engine/caption-fx';
import { applyWordMasks, groupWordsByAsset, maskWordsSummary, parseMaskWordsInput } from '@pireel/studio-engine/word-masks-tool';
import { applyComponentValues, blockPropsReadback, componentSchemaOf, componentValuesView, componentPropertyInputError } from '@pireel/studio-engine/component-schema';
import { dataEditFields, setDataEditText } from '@pireel/studio-engine/component-props';
import { placeGraphicsV3, setConfirmListV3, setLookV3 } from '@pireel/studio-engine/look-tools';
import { isComponentPropertyValue } from '@pireel/studio-engine/component-property-input';
import type { TranscriptSegment } from '@pireel/studio-engine/project-dto';
import {
  type AgentTimelineOutcome,
  type Input,
  addTexts,
  fail,
  importAssets,
  inspectAssets,
  locatedClip,
  manageLinks,
  manageTracks,
  mediaBox,
  mutation,
  placeClips,
  setClipPatches,
  setVideoSpeed,
  string,
  swapClipMedia,
  syncClips,
  updateTexts,
} from '@pireel/studio-engine/agent-timeline';

/* ================================ shared ================================ */

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isFrame = (value: unknown, min = 0): value is number => Number.isInteger(value) && (value as number) >= min;
const framesToSec = (frames: number, fps: number): number => frames / fps;
const r1 = (x: number) => Math.round(x * 10) / 10;

type OverlayKind = 'graphic' | 'text' | 'caption';
const OVERLAY_KINDS: ReadonlySet<string> = new Set<OverlayKind>(['graphic', 'text', 'caption']);
const isOverlayClip = (clip: TimelineClip): boolean => OVERLAY_KINDS.has(clip.kind);
const isVideoClip = (document: EditorDocumentV2, clip: TimelineClip): boolean =>
  (clip.kind === 'narrative' || clip.kind === 'media') && document.assets[clip.assetId]?.kind === 'video';

const allVideoShots = (document: EditorDocumentV2): VideoShot[] => [
  ...projectNarrativeShots(document),
  ...mediaVideoClipEntries(document).map((entry) => entry.shot),
];
const blockName = (block: Block): string => block.label?.slice(0, 10) || blockKind(block);

/** Convert one v3 clip row (frames, pairs) to the placement row the engine's placer reads. */
const LEGACY_CLIP_KEYS = ['startSec', 'durationSec', 'sourceInSec', 'sourceOutSec', 'fadeInSec', 'fadeOutSec', 'muted', 'toTrackId'] as const;

function clipRowToPlacement(document: EditorDocumentV2, row: Input, index: number, fps: number, path: string): Input | AgentTimelineOutcome {
  const legacy = LEGACY_CLIP_KEYS.filter((key) => row[key] !== undefined);
  if (legacy.length) {
    return fail(`${path}[${index}] uses ${legacy.join(', ')}; this tool takes startFrame, durationFrames, source [inSec, outSec] or words [firstWordId, lastWordId], fades {in, out} in frames and mute`, { path: `${path}[${index}]`, legacyKeys: legacy });
  }
  const { startFrame, durationFrames, source, words, fades, mute, ...rest } = row;
  const item: Input = { ...rest };
  if (words !== undefined) {
    // A passage chosen from the transcript is placed by the ids of its first and last word: the
    // engine looks the source seconds up, the model copies ids it has seen and never does the
    // arithmetic (the largest correctness risk in transcript-driven cuts).
    if (source !== undefined) return fail('invalid_value', { path: `${path}[${index}].words`, fix: 'Pass either source [inSec, outSec] or words [firstWordId, lastWordId], not both.' });
    const ids = Array.isArray(words) ? words.filter((id): id is string => typeof id === 'string' && !!id.trim()).map((id) => id.trim()) : [];
    if (!ids.length || ids.length > 2) return fail('invalid_value', { path: `${path}[${index}].words`, value: words, fix: 'words is [firstWordId, lastWordId] (or one id for a single word) from get_transcript {granularity:"words"}.' });
    const resolved = resolveDocumentWordIds(document, ids);
    if (resolved.missing.length) return fail('unknown_id', { path: `${path}[${index}].words`, unknownIds: resolved.missing, fix: 'Word ids come only from get_transcript {granularity:"words"} and shift after cuts; re-read and send current ids.' });
    const assets = [...new Set(resolved.words.map((word) => word.assetId))];
    if (assets.length > 1) return fail('invalid_value', { path: `${path}[${index}].words`, fix: `The two words belong to different sources (${assets.join(', ')}); a clip plays one source.` });
    const assetId = assets[0]!;
    if (string(item.assetId) && item.assetId !== assetId) return fail('invalid_value', { path: `${path}[${index}].assetId`, value: item.assetId, fix: `The words belong to ${assetId}; omit assetId or pass that one.` });
    item.assetId = assetId;
    const start = Math.min(...resolved.words.map((word) => word.start));
    const end = Math.max(...resolved.words.map((word) => word.end));
    if (!(end > start)) return fail('invalid_value', { path: `${path}[${index}].words`, fix: 'The last word must end after the first word starts.' });
    item.sourceInSec = start;
    item.sourceOutSec = end;
    // A spoken passage chosen by its words is speech: it goes back on the story spine unless the
    // call names another lane (left to the default it lands muted on a B-roll lane).
    if (!string(item.role) && !string(item.trackId) && document.assets[assetId]?.kind === 'video') item.role = 'primary';
  }
  if (startFrame !== undefined) {
    if (!isFrame(startFrame)) return fail(`${path}[${index}].startFrame must be an integer frame ≥ 0`);
    item.startSec = framesToSec(startFrame, fps);
  }
  if (durationFrames !== undefined) {
    if (!isFrame(durationFrames, 1)) return fail(`${path}[${index}].durationFrames must be an integer frame count ≥ 1`);
    item.durationSec = framesToSec(durationFrames, fps);
  }
  if (source !== undefined) {
    if (!Array.isArray(source) || source.length !== 2 || !source.every(isFiniteNumber)) {
      return fail(`${path}[${index}].source is a two-number array [inSec, outSec], not a string`);
    }
    item.sourceInSec = source[0];
    item.sourceOutSec = source[1];
  }
  if (fades && typeof fades === 'object') {
    const f = fades as Input;
    if (isFiniteNumber(f.in)) item.fadeInSec = framesToSec(f.in, fps);
    if (isFiniteNumber(f.out)) item.fadeOutSec = framesToSec(f.out, fps);
  }
  if (typeof mute === 'boolean') item.muted = mute;
  if (!string(item.assetId)) return fail('missing_field', { path: `${path}[${index}].assetId`, fix: 'Pass assetId (from get_state or search_assets), or words [firstWordId, lastWordId] from get_transcript to place a spoken passage by its transcript.' });
  return item;
}

const isOutcome = (value: unknown): value is AgentTimelineOutcome =>
  typeof value === 'object' && value !== null && 'ok' in (value as Record<string, unknown>);

/* ================================ clips ================================ */

function duplicateGraphic(document: EditorDocumentV2, clipId: string, startFrame: number | undefined): AgentTimelineOutcome & { newClipId?: string } {
  const found = locatedClip(document, clipId);
  const block = projectOverlayBlockById(document, clipId);
  if (!block || !found || !isOverlayClip(found.clip)) return fail(`duplicate: ${clipId} is not a graphic or text clip`);
  const atFrame = startFrame !== undefined ? startFrame : found.clip.startFrame + found.clip.durationFrames;
  const at = framesToSec(atFrame, document.canvas.fps);
  const newClipId = blockId('ai');
  const stackOrder = freeOverlayStackOrder(document, atFrame, found.clip.durationFrames, block.trackIndex);
  // Stack order is shared across visual, graphics and caption lanes: a B-roll lane can sit at the
  // order the graphic wants. Only a graphics lane may take the copy; otherwise a new one is minted
  // at that order (the same rule insert_clips applies).
  const target = found.clip.kind === 'caption'
    ? found.track
    : document.timeline.tracks.find((track) => track.type === 'graphics' && track.stackOrder === stackOrder);
  const edit = duplicateOverlayDocumentClip({
    document,
    clipId,
    newClipId,
    startSec: at,
    ...(target ? { toTrackId: target.id } : { newTrack: { id: `track_graphics_${blockId('lane')}`, name: 'Graphics', stackOrder } }),
  });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return { ...mutation(edit.document, `Duplicated "${blockName(block)}"`, edit.receipts, { newClipId }), newClipId };
}

export function addClipsV3(document: EditorDocumentV2, input: Input, mode: 'overwrite' | 'ripple'): AgentTimelineOutcome {
  const fps = document.canvas.fps;
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const data: Record<string, unknown> = {};
  const summaries: string[] = [];
  // Host-resolved catalog records for ids not yet registered in this output (library and official
  // media placed straight from a search result).
  if (Array.isArray(input.placementAssets) && input.placementAssets.length) {
    const missing = (input.placementAssets as Input[]).filter((asset) => typeof asset.id === 'string' && !next.assets[asset.id as string]);
    if (missing.length) {
      const registered = importAssets(next, { assets: missing });
      if (!registered.ok || !registered.document) return registered;
      next = registered.document;
      receipts.push(...(registered.receipts ?? []));
    }
  }
  if (mode === 'overwrite' && Array.isArray(input.duplicate) && input.duplicate.length) {
    const created: string[] = [];
    for (const [index, raw] of (input.duplicate as Input[]).entries()) {
      const clipId = string(raw?.clipId);
      if (!clipId) return fail(`duplicate[${index}].clipId is required`);
      if (raw.startFrame !== undefined && !isFrame(raw.startFrame)) return fail(`duplicate[${index}].startFrame must be an integer frame ≥ 0`);
      const duplicated = duplicateGraphic(next, clipId, raw.startFrame as number | undefined);
      if (!duplicated.ok || !duplicated.document) return duplicated;
      next = duplicated.document;
      receipts.push(...(duplicated.receipts ?? []));
      if (duplicated.newClipId) created.push(duplicated.newClipId);
    }
    data.duplicatedClipIds = created;
    summaries.push(`duplicated ${created.length} graphic${created.length === 1 ? '' : 's'}`);
  }
  if (Array.isArray(input.clips) && input.clips.length) {
    const rows: Input[] = [];
    for (const [index, raw] of (input.clips as Input[]).entries()) {
      const row = clipRowToPlacement(next, (raw ?? {}) as Input, index, fps, 'clips');
      if (isOutcome(row)) return row;
      rows.push(row);
    }
    const call: Input = { clips: rows };
    if (input.includeLinked === false) call.includeLinked = false;
    if (input.atFrame !== undefined) {
      if (!isFrame(input.atFrame)) return fail('atFrame must be an integer frame ≥ 0');
      call.atSec = framesToSec(input.atFrame, fps);
    }
    const placed = placeClips(next, call, mode);
    if (!placed.ok || !placed.document) return placed;
    next = placed.document;
    receipts.push(...(placed.receipts ?? []));
    Object.assign(data, placed.data as Record<string, unknown>);
    summaries.unshift(placed.summary ?? '');
    // Speech placed on the story spine (a restored passage, say) gets its caption rows too, the
    // way removing spine clips relays them; shifting the existing cues alone leaves it uncaptioned.
    const spine = next.timeline.tracks.find((track) => track.id === next.semantics.primaryNarrativeTrackId);
    const createdIds = new Set(Array.isArray(data.clipIds) ? data.clipIds as string[] : []);
    if (next.semantics.managedCaptionTrackId && spine?.clips.some((clip) => createdIds.has(clip.id))) {
      const relaid = applyEditorCommand(next, { type: 'captions.relay' });
      if (!relaid.ok) return fail(relaid.error.message, relaid.error);
      next = relaid.document;
      receipts.push(relaid.receipt);
    }
  }
  if (!summaries.length) return fail('clips is required', { fix: 'Pass clips: [{assetId, role?, startFrame?, …}] (or duplicate: [{clipId, startFrame?}] on add_clips).' });
  return mutation(next, summaries.filter(Boolean).join('; '), receipts, data);
}

export function moveClipsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('items is required', { fix: 'Pass items: [{clipId, startFrame, trackId?}].' });
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    const found = clipId ? locatedClip(next, clipId) : undefined;
    if (!found) return fail(`items[${index}] clip not found: ${clipId ?? ''}`);
    if (!isFrame(item.startFrame)) return fail(`items[${index}].startFrame must be an integer frame ≥ 0`);
    if (isOverlayClip(found.clip) && !string(item.trackId)) {
      const edit = retimeOverlayDocumentClip({ document: next, clipId: found.clip.id, startSec: framesToSec(item.startFrame, next.canvas.fps) });
      if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
      next = edit.document;
      receipts.push(...edit.receipts);
      continue;
    }
    const spineId = next.semantics.primaryNarrativeTrackId;
    // A spine clip linked to another lane keeps its partners' timing, so it moves as placed.
    const onSpine = found.track.id === spineId && (!string(item.trackId) || string(item.trackId) === spineId) && !found.clip.linkGroupId;
    const moved = applyEditorCommand(next, {
      type: 'clip.move', trackId: found.track.id, clipId: found.clip.id,
      startFrame: item.startFrame,
      ...(string(item.trackId) ? { toTrackId: string(item.trackId) } : {}),
      includeLinked: input.includeLinked !== false,
    });
    if (!moved.ok) return fail(moved.error.message, moved.error);
    // On the story spine a move is a reorder: the clip lands before the first spine clip starting at
    // or after its new start, and the spine closes up, so it never leaves a hole or covers a shot.
    next = onSpine ? packPrimaryNarrative(moved.document, found.clip.id) : moved.document;
    receipts.push(moved.receipt);
  }
  return mutation(next, `Moved ${items.length} clip${items.length === 1 ? '' : 's'}`, receipts);
}

/** Close every gap on the story spine by moving later spine clips earlier; other lanes stay put.
 *  `firstOnTie` names a clip that goes before any clip starting on the same frame (a moved clip). */
function packPrimaryNarrative(document: EditorDocumentV2, firstOnTie?: string): EditorDocumentV2 {
  const trackId = document.semantics.primaryNarrativeTrackId;
  let changed = false;
  const tracks = document.timeline.tracks.map((track) => {
    if (track.id !== trackId) return track;
    let cursor = 0;
    const tie = (id: string) => (id === firstOnTie ? 0 : 1);
    const clips = [...track.clips]
      .sort((left, right) => left.startFrame - right.startFrame || tie(left.id) - tie(right.id) || left.id.localeCompare(right.id))
      .map((clip) => {
        const packed = clip.startFrame === cursor ? clip : { ...clip, startFrame: cursor };
        if (packed !== clip) changed = true;
        cursor += clip.durationFrames;
        return packed;
      });
    return changed ? { ...track, clips } : track;
  });
  return changed ? { ...document, timeline: { ...document.timeline, tracks } } : document;
}

/** Replace a clip's media while keeping its slot: timing, framing, level, fades and keyframes stay. */
export function swapClipMediaV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipId = string(input.clipId);
  const assetId = string(input.assetId);
  if (!clipId) return fail('missing_field', { path: 'clipId', fix: 'Pass the clip whose media should change.' });
  if (!assetId) return fail('missing_field', { path: 'assetId', fix: 'Pass the replacement asset id from get_state or search_assets.' });
  const found = locatedClip(document, clipId);
  if (!found) return fail(`clip not found: ${clipId}`);
  if (!document.assets[assetId]) return fail('unknown_id', { path: 'assetId', value: assetId, fix: 'The replacement must be a registered asset: take its id from get_state (library entries included) or register_media it first.' });
  const swapped = swapClipMedia(document, { clipId, assetId });
  if (!swapped.ok) return swapped;
  const after = locatedClip(swapped.document!, clipId)?.clip;
  const span = after && 'sourceInSec' in after && 'sourceOutSec' in after ? { source: [after.sourceInSec, after.sourceOutSec] } : {};
  return mutation(swapped.document!, `Swapped the media on ${clipId}`, [], { clipId, assetId, frames: after ? [after.startFrame, after.startFrame + after.durationFrames] : undefined, ...span });
}

export function removeClipsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipIds = Array.isArray(input.clipIds) ? [...new Set(input.clipIds.map(string).filter((id): id is string => !!id))] : [];
  if (!clipIds.length) return fail('clipIds is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const missingClipIds: string[] = [];
  const overlays: string[] = [];
  const byTrack = new Map<string, string[]>();
  for (const id of clipIds) {
    const found = locatedClip(next, id);
    if (!found) { missingClipIds.push(id); continue; }
    if (isOverlayClip(found.clip)) overlays.push(id);
    else byTrack.set(found.track.id, [...(byTrack.get(found.track.id) ?? []), id]);
  }
  if (!overlays.length && !byTrack.size) return fail(`clip not found: ${missingClipIds.join(', ')}`);
  if (overlays.length) {
    const edit = removeOverlayDocumentClips({ document: next, clipIds: overlays });
    if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
    next = edit.document;
    receipts.push(...edit.receipts);
  }
  for (const [trackId, ids] of byTrack) {
    const remaining = ids.filter((id) => locatedClip(next, id)?.track.id === trackId);
    if (!remaining.length) continue;
    const removed = applyEditorCommand(next, { type: 'clips.remove', trackId, clipIds: remaining, includeLinked: input.includeLinked !== false });
    if (!removed.ok) return fail(removed.error.message, removed.error);
    next = removed.document;
    receipts.push(removed.receipt);
  }
  if (byTrack.has(document.semantics.primaryNarrativeTrackId)) {
    // The story spine has no gaps: what follows a removed spine clip plays earlier. Only the spine
    // moves — speech, captions and graphics keep their timeline positions (ripple_delete_ranges is
    // the edit that takes a span out of every lane).
    next = packPrimaryNarrative(next);
    const relaid = applyEditorCommand(next, { type: 'captions.relay' });
    if (!relaid.ok) return fail(relaid.error.message, relaid.error);
    next = relaid.document;
    receipts.push(relaid.receipt);
  }
  const removedCount = clipIds.length - missingClipIds.length;
  const summary = `Removed ${removedCount} clip${removedCount === 1 ? '' : 's'}`
    + (missingClipIds.length ? ` (${missingClipIds.length} already gone: ${missingClipIds.join(', ')})` : '');
  return mutation(next, summary, receipts, {
    removedClipIds: clipIds.filter((id) => !missingClipIds.includes(id)),
    ...(missingClipIds.length ? { missingClipIds } : {}),
  });
}

export function splitClipsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('items is required', { fix: 'Pass items: [{clipId?, atFrame}].' });
  const fps = document.canvas.fps;
  const spinePoints: number[] = [];
  const clipCuts: Array<{ clipId: string; atFrame: number }> = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    if (!isFrame(item.atFrame, 1)) return fail(`items[${index}].atFrame must be an integer frame ≥ 1`);
    const clipId = string(item.clipId);
    if (!clipId) { spinePoints.push(framesToSec(item.atFrame, fps)); continue; }
    const found = locatedClip(document, clipId);
    if (!found) return fail(`items[${index}] clip not found: ${clipId}`);
    if (found.clip.kind === 'narrative' && found.track.id === document.semantics.primaryNarrativeTrackId) spinePoints.push(framesToSec(item.atFrame, fps));
    else clipCuts.push({ clipId, atFrame: item.atFrame });
  }
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const created: string[] = [];
  if (spinePoints.length) {
    if (!primaryNarrativeClips(next).length) return fail('no story-spine footage to split');
    const points = normalizeNarrationSplitPoints(spinePoints, STUDIO_AGENT_EXECUTION_LIMITS.splitPointsPerCall);
    if ('error' in points) return fail(points.error);
    const command = applyNarrationSplitCommands(next, points);
    if (!command.ok) return fail(command.error.message, { code: command.error.code, trackIds: command.error.trackIds });
    next = command.document;
    receipts.push(...command.receipts);
  }
  for (const cut of clipCuts) {
    const found = locatedClip(next, cut.clipId);
    if (!found) return fail(`clip not found after earlier splits: ${cut.clipId}`);
    const split = applyEditorCommand(next, { type: 'clip.split', trackId: found.track.id, clipId: found.clip.id, atFrame: cut.atFrame, includeLinked: input.includeLinked !== false });
    if (!split.ok) return fail(split.error.message, split.error);
    next = split.document;
    receipts.push(split.receipt);
    created.push(...split.receipt.createdClipIds);
  }
  const count = spinePoints.length + clipCuts.length;
  return mutation(next, `Split at ${count} point${count === 1 ? '' : 's'}`, receipts, {
    ...(created.length ? { createdClipIds: created } : {}),
    ...(spinePoints.length ? { spineCutFrames: spinePoints.map((sec) => secondsToTimelineFrames(sec, fps)) } : {}),
  });
}

export function rippleDeleteRangesV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const raw = Array.isArray(input.ranges) ? (input.ranges as unknown[]) : [];
  if (!raw.length) return fail('ranges is required', { fix: 'Pass ranges: [[fromFrame, toFrame), …].' });
  const parsed: Array<[number, number]> = [];
  for (const [index, range] of raw.entries()) {
    if (!Array.isArray(range) || range.length !== 2 || !isFrame(range[0]) || !isFrame(range[1]) || (range[1] as number) <= (range[0] as number)) {
      return fail(`ranges[${index}] must be [fromFrame, toFrame) with integer toFrame > fromFrame ≥ 0`);
    }
    parsed.push([range[0] as number, range[1] as number]);
  }
  parsed.sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index]![0] < parsed[index - 1]![1]) return fail('ranges overlap; merge them before calling', { path: 'ranges', value: [parsed[index - 1], parsed[index]] });
  }
  if (!primaryNarrativeClips(document).length) return fail('no story-spine footage on the timeline');
  const fps = document.canvas.fps;
  const total = editorTimelineTotalFrames(document);
  const clamped = parsed.map(([from, to]) => [from, Math.min(to, total)] as [number, number]).filter(([from, to]) => to > from);
  if (!clamped.length) return fail('ranges_not_on_timeline', { fix: `The output ends at frame ${total}; nothing to cut there.` });
  const edit = applyNarrationDocumentEdit({
    projectId: '',
    document,
    ranges: clamped.map(([from, to]) => ({ fromSec: framesToSec(from, fps), toSec: framesToSec(to, fps) })),
    mainTranscript: null,
    clipTranscripts: {},
  });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  const removedFrames = clamped.reduce((sum, [from, to]) => sum + (to - from), 0);
  return mutation(edit.document, `Cut ${clamped.length} range${clamped.length === 1 ? '' : 's'}, ${removedFrames} frames removed`, edit.receipts, { ranges: clamped, removedFrames });
}

/* ============================== properties ============================== */

function setComponentProps(document: EditorDocumentV2, clipId: string, pairs: unknown): AgentTimelineOutcome {
  const rows = Array.isArray(pairs) ? (pairs as unknown[]) : [];
  const valid = rows.length > 0 && rows.length <= 8 && rows.every((pair) => pair && typeof pair === 'object' && string((pair as Input).key) && isComponentPropertyValue((pair as Input).value));
  if (!valid) return fail('props is a non-empty array of {key, value} pairs; keys come from component.props in get_state');
  const block = projectOverlayBlockById(document, clipId);
  if (!block) return fail(`graphic clip not found: ${clipId}`);
  const look = document.appearance.look;
  const view = componentSchemaOf(block, look);
  if (!view) return fail('this component has no editable properties (media, caption, or a component without a properties schema)');
  const requested = Object.fromEntries(rows.map((pair) => [(pair as Input).key as string, (pair as Input).value]));
  const declared = Object.keys(view.schema.properties ?? {});
  const unknown = Object.keys(requested).filter((key) => !declared.includes(key));
  if (unknown.length) return fail(`unknown properties: ${unknown.join(', ')} — declared: ${declared.join(', ')}`);
  const valueError = componentPropertyInputError(view, requested);
  if (valueError) return fail(valueError);
  const slots = applyComponentValues(block, requested, look)!;
  const edit = applyOverlayDocumentEdits({ document, updates: [{ clipId: block.id, block: { slots } }] });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  const after = componentSchemaOf({ templateId: block.templateId, slots }, look)!;
  return mutation(edit.document, `Set ${rows.length} propert${rows.length === 1 ? 'y' : 'ies'} on "${blockName(block)}"`, edit.receipts, { clipId, props: componentValuesView(after) });
}

function setComponentTexts(document: EditorDocumentV2, clipId: string, pairs: unknown): AgentTimelineOutcome {
  const rows = Array.isArray(pairs) ? (pairs as unknown[]) : [];
  const valid = rows.length > 0 && rows.every((pair) => pair && typeof pair === 'object' && string((pair as Input).key) && typeof (pair as Input).value === 'string');
  if (!valid) return fail('texts is a non-empty array of {key, value} pairs; keys come from component.texts in get_state');
  const block = projectOverlayBlockById(document, clipId);
  if (!block) return fail(`graphic clip not found: ${clipId}`);
  let innerHtml = block.templateId === 'custom' && typeof block.slots.innerHtml === 'string' ? block.slots.innerHtml : '';
  const declared = dataEditFields(innerHtml).map((field) => field.key);
  if (!declared.length) return fail('this component has no editable text: a registered component keeps its wording in component.props; otherwise rewrite it with apply_component');
  const unknown = rows.map((pair) => (pair as Input).key as string).filter((key) => !declared.includes(key));
  if (unknown.length) return fail(`unknown text keys: ${unknown.join(', ')} — declared: ${declared.join(', ')}`);
  for (const pair of rows as Input[]) innerHtml = setDataEditText(innerHtml, pair.key as string, pair.value as string) ?? innerHtml;
  const edit = applyOverlayDocumentEdits({ document, updates: [{ clipId: block.id, block: { slots: { ...block.slots, innerHtml } } }] });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, `Set ${rows.length} text${rows.length === 1 ? '' : 's'} on "${blockName(block)}"`, edit.receipts, { clipId, texts: dataEditFields(innerHtml) });
}

export function setClipPropertiesV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('items is required', { fix: 'Pass items: [{clipId, …properties}].' });
  const fps = document.canvas.fps;
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const notes: string[] = [];
  let changes = 0;
  const step = (outcome: AgentTimelineOutcome): AgentTimelineOutcome | null => {
    if (!outcome.ok) return outcome;
    if (outcome.document) next = outcome.document;
    receipts.push(...(outcome.receipts ?? []));
    changes += 1;
    return null;
  };
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    if (!clipId) return fail(`items[${index}].clipId is required`);
    const found = locatedClip(next, clipId);
    if (!found) return fail(`items[${index}] clip not found: ${clipId}`);
    const kind = found.clip.kind;
    const overlay = isOverlayClip(found.clip);
    const video = isVideoClip(next, found.clip);
    let failed: AgentTimelineOutcome | null = null;

    // The capability table decides what this kind takes; the code below only knows how to apply it.
    const capability = clipCapabilityContext(next, found.clip);
    for (const key of Object.keys(item)) {
      if (key === 'clipId' || item[key] === undefined) continue;
      const refusal = clipFieldRefusal(capability, key);
      if (refusal) return fail('unknown_field', { path: `items[${index}].${key}`, fix: refusal.fix });
    }

    if (item.source !== undefined) {
      if (!Array.isArray(item.source) || item.source.length !== 2 || !item.source.every(isFiniteNumber)) return fail(`items[${index}].source is a two-number array [inSec, outSec], not a string`);
      failed = step(setClipPatches(next, { items: [{ clipId, sourceInSec: item.source[0], sourceOutSec: item.source[1] }] }));
      if (failed) return failed;
    }
    if (item.durationFrames !== undefined) {
      if (!isFrame(item.durationFrames, 1)) return fail(`items[${index}].durationFrames must be an integer frame count ≥ 1`);
      const edit = retimeOverlayDocumentClip({ document: next, clipId, durationSec: framesToSec(item.durationFrames, fps) });
      if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
      next = edit.document; receipts.push(...edit.receipts); changes += 1;
    }
    if (isFiniteNumber(item.speed)) {
      if (video) failed = step(setVideoSpeed(next, { shotIds: [clipId], speed: item.speed, ...(typeof item.ripple === 'boolean' ? { ripple: item.ripple } : {}) }));
      else failed = step(setClipPatches(next, { items: [{ clipId, speed: item.speed }] }));
      if (failed) return failed;
    }
    const fades = item.fades && typeof item.fades === 'object' ? (item.fades as Input) : undefined;
    const fadeInSec = fades && isFiniteNumber(fades.in) ? framesToSec(fades.in, fps) : undefined;
    const fadeOutSec = fades && isFiniteNumber(fades.out) ? framesToSec(fades.out, fps) : undefined;
    const soundPatch = {
      ...(isFiniteNumber(item.volumeDb) ? { volumeDb: item.volumeDb } : {}),
      ...(typeof item.mute === 'boolean' ? { mute: item.mute } : {}),
      ...(fadeInSec !== undefined ? { fadeInSec } : {}),
      ...(fadeOutSec !== undefined ? { fadeOutSec } : {}),
    };
    if (Object.keys(soundPatch).length) {
      if (video) {
        const native = applyVideoClipSettingsPatches(next, [{ clipId, patch: { audio: soundPatch } }]);
        if (!native.ok) return fail(native.error, native.data);
        next = native.document; changes += 1;
      } else {
        failed = step(setClipPatches(next, { items: [{ clipId,
          ...(soundPatch.volumeDb !== undefined ? { volumeDb: soundPatch.volumeDb } : {}),
          ...(soundPatch.mute !== undefined ? { muted: soundPatch.mute } : {}),
          ...(fadeInSec !== undefined ? { fadeInSec } : {}),
          ...(fadeOutSec !== undefined ? { fadeOutSec } : {}),
        }] }));
        if (failed) return failed;
      }
    }
    if (item.filter && typeof item.filter === 'object') {
      const f = item.filter as Input;
      const filter: ShotFilter = {
        ...(isFiniteNumber(f.brightness) ? { brightness: f.brightness } : {}),
        ...(isFiniteNumber(f.contrast) ? { contrast: f.contrast } : {}),
        ...(isFiniteNumber(f.saturate) ? { saturate: f.saturate } : {}),
      };
      const css = shotFilterCss(filter);
      const native = applyVideoClipSettingsPatches(next, [{ clipId, patch: { filter: css === 'none' ? null : filter } }]);
      if (!native.ok) return fail(native.error, native.data);
      next = native.document; changes += 1;
      notes.push(css === 'none' ? `reset the colour grade on ${clipId}` : `graded ${clipId}: ${css}`);
    }
    const common: Input = { clipId };
    if (typeof item.enabled === 'boolean') common.enabled = item.enabled;
    if (isFiniteNumber(item.opacity)) common.opacity = item.opacity;
    if (item.box !== undefined) {
      if (!mediaBox(item.box)) return fail(`items[${index}].box must be a positive normalized rect inside the canvas`);
      if (overlay) {
        const edit = applyOverlayDocumentEdits({ document: next, updates: [{ clipId, block: { box: mediaBox(item.box)! } }] });
        if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
        next = edit.document; receipts.push(...edit.receipts); changes += 1;
      } else common.box = item.box;
    }
    if (Object.keys(common).length > 1) {
      failed = step(setClipPatches(next, { items: [common] }));
      if (failed) return failed;
    }
    if (item.props !== undefined) {
      failed = step(setComponentProps(next, clipId, item.props));
      if (failed) return failed;
    }
    if (item.texts !== undefined) {
      failed = step(setComponentTexts(next, clipId, item.texts));
      if (failed) return failed;
    }
    if (item.motion !== undefined) {
      const motion = item.motion as Input;
      const speed = motion && isFiniteNumber(motion.speed) ? motion.speed : undefined;
      const delaySec = motion && isFiniteNumber(motion.delaySec) ? motion.delaySec : undefined;
      if (speed === undefined && delaySec === undefined) return fail(`items[${index}].motion needs speed and/or delaySec`);
      if (speed !== undefined && (speed < 0.25 || speed > 4)) return fail(`items[${index}].motion.speed must be 0.25–4`);
      if (delaySec !== undefined && delaySec < 0) return fail(`items[${index}].motion.delaySec must be ≥ 0`);
      const block = projectOverlayBlockById(next, clipId);
      if (!block) return fail(`graphic clip not found: ${clipId}`);
      const merged = { ...block.motion, ...(speed !== undefined ? { speed } : {}), ...(delaySec !== undefined ? { delaySec } : {}) };
      const kept = { ...(merged.speed && merged.speed !== 1 ? { speed: merged.speed } : {}), ...(merged.delaySec ? { delaySec: merged.delaySec } : {}) };
      const edit = applyOverlayDocumentEdits({ document: next, updates: [{ clipId: block.id, block: { motion: Object.keys(kept).length ? kept : undefined } }] });
      if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
      next = edit.document; receipts.push(...edit.receipts); changes += 1;
    }
  }
  if (!changes) return fail('nothing_to_change', { fix: 'Each item needs at least one property besides clipId.' });
  return mutation(next, `Updated ${items.length} clip${items.length === 1 ? '' : 's'}${notes.length ? ` (${notes.join('; ')})` : ''}`, receipts);
}

export function setClipFramingV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('items is required', { fix: 'Pass items: [{clipId, treatment? | box? | transform? | cropInsets?}].' });
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const updates: unknown[] = [];
  const treatmentIds = SHOT_TREATMENTS.map((entry) => entry.id) as readonly string[];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    if (!clipId) return fail(`items[${index}].clipId is required`);
    const found = locatedClip(next, clipId);
    if (!found) return fail(`items[${index}] clip not found: ${clipId}`);
    // A push-in animates decoded picture; anything else is refused before the kind branches so
    // the refusal names the tool that animates that kind.
    if (item.zoom !== undefined && !isVideoClip(next, found.clip)) return fail('unknown_field', { path: `items[${index}].zoom`, fix: 'zoom animates video clips; animate an image or graphic clip with set_keyframes box or through its component.' });
    if (isOverlayClip(found.clip)) {
      const block = projectOverlayBlockById(next, clipId);
      if (!block) return fail(`items[${index}] graphic clip not found: ${clipId}`);
      if (isSentenceCaption(block)) return fail(`items[${index}] is the caption layer — position it with set_captions yPct/scale`);
      if (!block.box) return fail(`items[${index}] has no screen box (full-canvas element) and cannot be repositioned`);
      if (string(item.anchor) && !(PLACE_ANCHORS as readonly string[]).includes(string(item.anchor)!)) return fail(`items[${index}].anchor must be one of ${PLACE_ANCHORS.join(' / ')}`);
      const box = item.box && typeof item.box === 'object' ? (item.box as Input) : undefined;
      const place: Input = {};
      if (string(item.anchor)) place.anchor = item.anchor;
      if (box) {
        if (isFiniteNumber(box.x)) place.xPct = box.x * 100;
        if (isFiniteNumber(box.y)) place.yPct = box.y * 100;
        if (isFiniteNumber(box.w)) place.widthPct = box.w * 100;
        if (isFiniteNumber(box.h)) place.heightPct = box.h * 100;
      }
      if (isFiniteNumber(item.scale)) place.scale = item.scale;
      if (!Object.keys(place).length) return fail(`items[${index}] takes box {x,y,w,h} in canvas units, anchor, or scale for a graphic or text clip`);
      const placed = applyBlockPlacement(block, place as Parameters<typeof applyBlockPlacement>[1]);
      if (!placed) return fail(`items[${index}]: no effective position or size change`);
      const edit = applyOverlayDocumentEdits({ document: next, updates: [{ clipId: block.id, block: { box: placed.box, contentBox: placed.contentBox } }] });
      if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
      next = edit.document;
      receipts.push(...edit.receipts);
      const framing = placementFramingNotes(projectNarrativeShots(next), placed.startSec, placed.durationSec);
      updates.push({ clipId, box: placed.box, zone: zoneOf(placed.box!), ...(framing.length ? { hint: framing.join('; ') } : {}) });
      continue;
    }
    if (found.clip.kind !== 'narrative' && found.clip.kind !== 'media') return fail(`items[${index}] framing applies to video, image and graphic clips`);
    let touched = false;
    if (item.pip !== undefined) {
      const placed = ['treatment', 'box', 'transform', 'cropInsets'].filter((key) => item[key] !== undefined);
      if (placed.length) return fail('conflicting_fields', { path: `items[${index}]`, fields: ['pip', ...placed], fix: 'pip places the picture itself; send it without treatment, box, transform or cropInsets (zoom may stay).' });
      const pip = (item.pip && typeof item.pip === 'object' ? item.pip : {}) as Input;
      const layout = pip.layout === 'none' ? null : { layout: pip.layout, ...(pip.position !== undefined ? { position: pip.position } : {}), ...(pip.size !== undefined ? { size: pip.size } : {}) } as ClipPipLayout;
      const laid = setClipPipLayout(next, { clipId, layout });
      if (!laid.ok) return fail(laid.error, { path: `items[${index}].pip`, ...(laid.code === 'invalid-command' && found.clip.kind === 'narrative' ? { fix: 'pip arranges a B-roll picture over the speaker; place the picture with add_clips role broll, then give that clip the pip.' } : {}) });
      // Derive now, so the receipt reports where the picture landed.
      next = refreshClipPipLayouts(laid.document);
      updates.push({ clipId, pip: layout ?? 'none' });
      touched = true;
    }
    if (item.zoom !== undefined) {
      // An animated push-in is intent on the clip: preset + where it starts (timeline frame inside
      // the clip) + how long + how far; the stage and the export expand the same moves.
      const zoom = item.zoom && typeof item.zoom === 'object' ? (item.zoom as Input) : {};
      const preset = string(zoom.preset);
      const presetIds = ZOOM_PRESETS.map((entry) => entry.id) as readonly string[];
      if (!preset || (preset !== 'none' && !presetIds.includes(preset))) return fail('invalid_value', { path: `items[${index}].zoom.preset`, value: zoom.preset, allowed: [...presetIds, 'none'] });
      if (preset === 'none') {
        const cleared = applyVideoClipSettingsPatches(next, [{ clipId, patch: { zoom: null } }]);
        if (!cleared.ok) return fail(cleared.error, cleared.data);
        next = cleared.document;
        updates.push({ clipId, zoom: null });
      } else {
        const fps = next.canvas.fps;
        const clipStart = found.clip.startFrame;
        const clipEnd = found.clip.startFrame + found.clip.durationFrames;
        const atFrame = zoom.atFrame === undefined ? clipStart : zoom.atFrame;
        if (!isFrame(atFrame) || atFrame < clipStart || atFrame >= clipEnd) return fail('invalid_value', { path: `items[${index}].zoom.atFrame`, value: zoom.atFrame, fix: `atFrame is a timeline frame inside the clip: ${clipStart} ≤ atFrame < ${clipEnd}.` });
        if (zoom.durationFrames !== undefined && !isFrame(zoom.durationFrames, 1)) return fail('invalid_value', { path: `items[${index}].zoom.durationFrames`, value: zoom.durationFrames, fix: 'durationFrames is an integer frame count ≥ 1; omit it to run to the end of the clip.' });
        const scale = zoom.scale === undefined ? ZOOM_PRESETS.find((entry) => entry.id === preset)!.scale : zoom.scale;
        if (!isFiniteNumber(scale) || scale < ZOOM_SCALE_MIN || scale > ZOOM_SCALE_MAX) return fail('invalid_value', { path: `items[${index}].zoom.scale`, value: zoom.scale, fix: `scale is a magnification between ${ZOOM_SCALE_MIN} and ${ZOOM_SCALE_MAX} on top of the clip's framing.` });
        for (const axis of ['anchorX', 'anchorY'] as const) {
          if (zoom[axis] !== undefined && (!isFiniteNumber(zoom[axis]) || (zoom[axis] as number) < 0 || (zoom[axis] as number) > 1)) return fail('invalid_value', { path: `items[${index}].zoom.${axis}`, value: zoom[axis], fix: `${axis} is the layer point 0–1 that stays still while zooming.` });
        }
        const value = {
          preset: preset as (typeof ZOOM_PRESETS)[number]['id'],
          atSec: framesToSec((atFrame as number) - clipStart, fps),
          ...(zoom.durationFrames !== undefined ? { durationSec: framesToSec(zoom.durationFrames as number, fps) } : {}),
          scale,
          ...(zoom.anchorX !== undefined ? { anchorX: zoom.anchorX as number } : {}),
          ...(zoom.anchorY !== undefined ? { anchorY: zoom.anchorY as number } : {}),
        };
        const applied = applyVideoClipSettingsPatches(next, [{ clipId, patch: { zoom: value } }]);
        if (!applied.ok) return fail(applied.error, applied.data);
        next = applied.document;
        updates.push({ clipId, zoom: { preset, atFrame, ...(zoom.durationFrames !== undefined ? { durationFrames: zoom.durationFrames } : {}), scale, ...(zoom.anchorX !== undefined ? { anchorX: zoom.anchorX } : {}), ...(zoom.anchorY !== undefined ? { anchorY: zoom.anchorY } : {}) } });
      }
      touched = true;
    }
    const recipe = ['treatment', 'size', 'crop', 'scale', 'anchorX', 'anchorY', 'coordinateSpace', 'resetPrecision'].filter((key) => item[key] !== undefined);
    if (recipe.length) {
      if (string(item.treatment) && !treatmentIds.includes(string(item.treatment)!)) return fail(`items[${index}].treatment must be one of ${treatmentIds.join(' / ')}`);
      const c = projectDocumentToComposition(next);
      const shots = allVideoShots(next);
      const row: Input = { shotId: clipId };
      for (const key of recipe) row[key] = item[key];
      const applied = applyShotFramingInput({ ...c, shots }, { updates: [row] }, shots);
      if ('error' in applied) return fail(applied.error);
      const native = applyVideoClipSettingsPatches(next, applied.patches.map(({ shotId, patch }) => ({ clipId: shotId, patch: { framing: patch } })));
      if (!native.ok) return fail(native.error, native.data);
      next = native.document;
      updates.push(...applied.updates);
      touched = true;
    }
    if (item.transform && typeof item.transform === 'object') {
      const edit = applyMediaTransformInput(next, { items: [{ clipId, ...(item.transform as Input) }] });
      if (!edit.ok) return fail(edit.error, edit.data);
      next = edit.document;
      updates.push(...edit.updates);
      touched = true;
    }
    if (item.cropInsets && typeof item.cropInsets === 'object') {
      const edit = applyMediaCropInput(next, { items: [{ clipId, ...(item.cropInsets as Input) }] });
      if (!edit.ok) return fail(edit.error, edit.data);
      next = edit.document;
      updates.push(...edit.updates);
      touched = true;
    }
    if (!touched) return fail(`items[${index}] takes a treatment recipe (treatment/size/crop/scale/anchorX/anchorY), transform {scale,offsetX,offsetY}, or cropInsets {top,right,bottom,left}`);
  }
  return mutation(next, `Updated framing for ${items.length} clip${items.length === 1 ? '' : 's'}`, receipts, { updates });
}

/* ========================== transition · canvas · layout ========================== */

export function addTransitionV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const allowed = [...CUT_TRANSITION_EFFECTS.map(({ id }) => id), 'none'];
  if (input.effect !== undefined && !allowed.includes(input.effect as string)) return fail('invalid_value', { path: 'effect', value: input.effect, allowed });
  if (input.direction !== undefined && !['up', 'down', 'left', 'right'].includes(input.direction as string)) return fail('invalid_value', { path: 'direction', value: input.direction, allowed: ['up', 'down', 'left', 'right'] });
  if (input.atFrame !== undefined && !isFrame(input.atFrame)) return fail('atFrame must be an integer frame ≥ 0');
  if (input.durationFrames !== undefined && !isFrame(input.durationFrames, 1)) return fail('durationFrames must be an integer frame count ≥ 1');
  const fps = document.canvas.fps;
  const list = document.timeline.transitions ?? [];
  const maxFrames = maxTransitionFrames(fps);
  const direction = string(input.direction) as TransitionDirection | undefined;
  const id = string(input.id);
  if (id) {
    const current = list.find((transition) => transition.id === id);
    if (!current) return fail('unknown_id', { path: 'id', value: id, fix: `Transitions are ${list.map((transition) => transition.id).join(', ') || '(none)'} — read get_state transitions.` });
    if (input.effect === 'none') {
      const removed = applyEditorCommand(document, { type: 'transitions.remove', ids: [id] });
      if (!removed.ok) return fail(removed.error.message, { code: removed.error.code });
      return mutation(removed.document, `Removed transition ${id}`, [removed.receipt], { id, removed: true });
    }
    const patch = {
      ...(string(input.effect) ? { effect: input.effect as CutTransitionEffect } : {}),
      ...(direction ? { direction } : {}),
      ...(isFrame(input.atFrame) ? { startFrame: input.atFrame } : {}),
      ...(isFrame(input.durationFrames, 1) ? { durationFrames: Math.min(maxFrames, input.durationFrames) } : {}),
    };
    const patched = applyEditorCommand(document, { type: 'transitions.patch', id, patch });
    if (!patched.ok) return fail(patched.error.message, { code: patched.error.code, fix: 'Transitions may not overlap; move it or shorten it.' });
    const next = patched.document.timeline.transitions!.find((transition) => transition.id === id)!;
    return mutation(patched.document, `Updated transition ${id}: ${next.effect} at frames ${next.startFrame}–${next.startFrame + next.durationFrames}`, [patched.receipt], { id, frames: [next.startFrame, next.startFrame + next.durationFrames], effect: next.effect, ...(next.direction ? { direction: next.direction } : {}) });
  }
  if (!isFrame(input.atFrame)) return fail('missing_field', { path: 'atFrame', fix: 'Pass atFrame to add a transition there, or id to change one.' });
  if (input.effect === 'none' || !string(input.effect)) return fail('missing_field', { path: 'effect', fix: 'Pass an effect to add; to remove one pass its id with effect "none".' });
  const effect = input.effect as CutTransitionEffect;
  const startFrame = transitionSlotAt(list, input.atFrame);
  const following = list.filter((transition) => transition.startFrame >= startFrame).sort((left, right) => left.startFrame - right.startFrame)[0];
  const wanted = isFrame(input.durationFrames, 1) ? Math.min(maxFrames, input.durationFrames) : Math.round(DEFAULT_TRANSITION_SEC * fps);
  const durationFrames = Math.min(wanted, following ? following.startFrame - startFrame : Number.POSITIVE_INFINITY);
  if (durationFrames < 1) return fail(`no room for a transition at frame ${input.atFrame}`, { fix: 'Transitions there fill the lane; pick another frame or shorten a neighbour.' });
  // Deterministic from the document, so a server replay mints the same id.
  const taken = new Set(list.map((transition) => transition.id));
  let ordinal = list.length + 1;
  while (taken.has(`transition_${ordinal}`)) ordinal += 1;
  const newId = `transition_${ordinal}`;
  const inserted = applyEditorCommand(document, { type: 'transitions.insert', transition: { id: newId, startFrame, durationFrames, effect, ...(direction && DIRECTIONAL_TRANSITIONS.has(effect) ? { direction } : {}) } });
  if (!inserted.ok) return fail(inserted.error.message, { code: inserted.error.code });
  const note = startFrame !== input.atFrame ? ` (queued after the transition already at frame ${input.atFrame})` : '';
  return mutation(inserted.document, `Added a ${effect} transition at frames ${startFrame}–${startFrame + durationFrames}${note}`, [inserted.receipt], { id: newId, frames: [startFrame, startFrame + durationFrames], effect });
}

export function setCanvasV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const followsSource = typeof input.preset === 'string' && ['source', 'auto', 'follow-source'].includes(input.preset.toLowerCase());
  const size = followsSource ? canvasSizeFollowingFirstVideo(document) : canvasSizeFromInput(input);
  if (!size) return fail(followsSource ? 'cannot follow source: place a video with known dimensions first' : 'invalid canvas: use preset source / portrait / landscape / square or width+height (240..7680)');
  const current = document.canvas;
  if (size.width === current.width && size.height === current.height && current.configured) {
    return { ok: true, summary: `Canvas already ${size.width}×${size.height}`, data: { canvas: size, changed: false } };
  }
  const edit = applyCanvasDocumentEdit({ projectId: '', document, ...size, mainTranscript: null, clipTranscripts: {} });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, `Set canvas to ${size.width}×${size.height}`, edit.receipts, { canvas: size });
}

export function applyLayoutV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const layout = string(input.layout);
  const layouts = ['picture-in-picture', 'split-left-right', 'split-top-bottom', 'grid'];
  if (!layout || !layouts.includes(layout)) return fail('invalid_value', { path: 'layout', value: input.layout, allowed: layouts });
  const blockIds = Array.isArray(input.blockIds) ? input.blockIds.map(string).filter((id): id is string => !!id) : [];
  if (!blockIds.length) return fail('blockIds is required');
  const c = projectDocumentToComposition(document);
  const mediaLocations = new Map(document.timeline.tracks.flatMap((track) => track.clips.filter((clip) => clip.kind === 'media').map((clip) => [clip.id, { trackId: track.id, clip }] as const)));
  const layoutKind = layout as Parameters<typeof applyCompositionLayout>[1]['layout'];
  if (!input.shotId && blockIds.every((id) => mediaLocations.has(id))) {
    // Media-only arrangement: the layout engine computes the boxes over stand-in blocks, then each
    // media clip takes its box directly.
    const stand: Block[] = blockIds.map((id, index) => ({ id, templateId: 'custom', slots: { innerHtml: '<div></div>', timelineBody: '' }, startSec: 0, durationSec: 1, trackIndex: index + 1 }));
    const planned = applyCompositionLayout({ ...c, blocks: [...c.blocks, ...stand] }, { layout: layoutKind, blockIds });
    if ('error' in planned) return fail(planned.error);
    let next = document;
    const receipts: EditorCommandReceipt[] = [];
    for (const id of blockIds) {
      const box = planned.comp.blocks.find((block) => block.id === id)?.box;
      if (!box) return fail(`layout did not produce geometry for media clip: ${id}`);
      const patched = applyEditorCommand(next, { type: 'clip.patch', trackId: mediaLocations.get(id)!.trackId, clipId: id, patch: { box } });
      if (!patched.ok) return fail(patched.error.message, patched.error);
      next = patched.document;
      receipts.push(patched.receipt);
    }
    return mutation(next, `Applied ${layout} layout to ${blockIds.length} media clip${blockIds.length === 1 ? '' : 's'}`, receipts, { blockIds, mediaClipIds: blockIds });
  }
  // The documented default: compose with the footage under the first graphic clip.
  let shotId = string(input.shotId);
  if (!shotId) {
    const firstGraphic = blockIds.map((id) => locatedClip(document, id)).find((found) => found && found.clip.kind !== 'media');
    if (firstGraphic) {
      const hit = narrativeAtTimelineSecond(document, framesToSec(firstGraphic.clip.startFrame, document.canvas.fps));
      if (!hit) return fail(`no footage plays under ${firstGraphic.clip.id}: pass shotId (a narrative clip) to compose with`);
      shotId = hit.clip.id;
    }
  }
  const edit = applyLayoutDocumentEdit({
    document,
    composition: c,
    layout: {
      layout: layoutKind,
      blockIds,
      ...(shotId ? { shotId } : {}),
      ...(string(input.videoPosition) ? { videoPosition: input.videoPosition as 'left' | 'right' | 'top' | 'bottom' } : {}),
    },
  });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, `Applied ${layout} layout`, edit.receipts, edit.layout);
}

/* ================================ tracks ================================ */

export function manageTracksV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const { order, ...rest } = input;
  return manageTracks(document, { ...rest, ...(isFiniteNumber(order) ? { stackOrder: order } : {}) });
}

export function manageClipLinksV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  if (input.action === 'sync') {
    const { action: _action, ...rest } = input;
    return syncClips(document, rest);
  }
  return manageLinks(document, input);
}

/* ================================= text ================================= */

export function setTextsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? (input.items as Input[]) : [];
  if (!items.length) return fail('items is required');
  const fps = document.canvas.fps;
  const adds: Input[] = [];
  const updates: Input[] = [];
  for (const [index, raw] of items.entries()) {
    const { id, startFrame, durationFrames, ...rest } = (raw ?? {}) as Input;
    const converted: Input = { ...rest };
    if (startFrame !== undefined) {
      if (!isFrame(startFrame)) return fail(`items[${index}].startFrame must be an integer frame ≥ 0`);
      converted.startSec = framesToSec(startFrame, fps);
    }
    if (durationFrames !== undefined) {
      if (!isFrame(durationFrames, 1)) return fail(`items[${index}].durationFrames must be an integer frame count ≥ 1`);
      converted.durationSec = framesToSec(durationFrames, fps);
    }
    // id names the clip: an existing text clip is updated; an unknown id with text and startFrame
    // creates the text under that id, so a caller can pre-mint ids instead of reading the receipt.
    const existing = string(id) ? locatedClip(document, string(id)!) : undefined;
    if (existing) updates.push({ clipId: id, ...converted });
    else {
      if (!string(converted.text) || converted.startSec === undefined) {
        return fail(string(id) ? `items[${index}]: no text clip with id "${id}" to update` : `items[${index}]: a new text needs text and startFrame; an update needs id`, string(id) ? { unknownIds: [id] } : undefined);
      }
      adds.push(string(id) ? { id, ...converted } : converted);
    }
  }
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const data: Record<string, unknown> = {};
  const summaries: string[] = [];
  if (adds.length) {
    const added = addTexts(next, { items: adds });
    if (!added.ok || !added.document) return added;
    next = added.document;
    receipts.push(...(added.receipts ?? []));
    Object.assign(data, added.data as Record<string, unknown>);
    summaries.push(added.summary ?? '');
  }
  if (updates.length) {
    const updated = updateTexts(next, { items: updates });
    if (!updated.ok) return updated;
    if (updated.document) next = updated.document;
    receipts.push(...(updated.receipts ?? []));
    Object.assign(data, updated.data as Record<string, unknown>);
    summaries.push(updated.summary ?? '');
  }
  return mutation(next, summaries.filter(Boolean).join('; '), receipts, data);
}

/* =============================== captions =============================== */

const CAPTION_FIX = 'Pass on, preset/yPct/scale/font, source, script, corrections, highlights, translations or relayout.';

/** The transcript a caption edit writes to: an explicit asset, the speech clip named (on any
 * lane), the source the caption layer is bound to, else the spine. */
function captionTranscriptOwner(document: EditorDocumentV2, clipId: string | undefined, explicitAssetId: string | undefined): { assetId: string } | AgentTimelineOutcome {
  if (explicitAssetId) {
    if (!document.assets[explicitAssetId]) return fail('unknown_id', { path: 'assetId', value: explicitAssetId, fix: 'assetId is a registered, transcribed asset from get_state.' });
    return { assetId: explicitAssetId };
  }
  if (clipId) {
    const found = locatedClip(document, clipId);
    if (!found) return fail('unknown_id', { path: 'clipId', value: clipId, fix: 'clipId is a clip from get_state that plays speech (spine, B-roll or narration audio).' });
    if (found.clip.kind === 'graphic' || found.clip.kind === 'caption') return fail('wrong_kind', { path: 'clipId', value: clipId, fix: 'Name the clip that plays the speech (spine, B-roll or narration audio), not a graphic or caption cue.' });
    return { assetId: found.clip.assetId };
  }
  const bound = boundCaptionSourceAssetId(document) ?? firstNarrativeAssetId(document);
  return bound ? { assetId: bound } : fail('no speech source on the timeline', { fix: 'Place footage or narration with add_clips and turn captions on first.' });
}

function captionCorrections(document: EditorDocumentV2, rows: unknown[], clipId: string | undefined, explicitAssetId: string | undefined): AgentTimelineOutcome {
  const items = rows
    .map((row) => { const value = (row ?? {}) as Input; return { index: Number(value.index), text: typeof value.text === 'string' ? value.text.trim() : '' }; })
    .filter((item) => Number.isInteger(item.index) && item.index >= 0 && item.text.length > 0);
  if (!items.length) return fail('corrections need {index, text} rows: index is the transcript row, text the complete corrected sentence');
  const owner = captionTranscriptOwner(document, clipId, explicitAssetId);
  if (isOutcome(owner)) return owner;
  const { assetId } = owner;
  const segments = document.semantics.transcripts[assetId] as AsrSegment[] | undefined;
  if (!segments?.length) return fail('no transcript for this source — read get_transcript first');
  const bad = items.filter((item) => item.index >= segments.length);
  if (bad.length) return fail(`index out of range: ${bad.map((item) => item.index).join(', ')} (this transcript has ${segments.length} rows)`);
  const resolved = resolveCaptionSentenceEdits(document, assetId, items);
  if (!resolved.ok) return fail(resolved.error);
  const next = applyCaptionTextEdits(segments, resolved.items);
  if (next === segments) return { ok: true, summary: 'Caption text already matches' };
  const edit = applyCaptionDocumentEdit({
    document: { ...document, semantics: { ...document.semantics, transcripts: { ...document.semantics.transcripts, [assetId]: next } } },
    mainTranscript: null,
    clipTranscripts: {},
  });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, `Corrected ${items.length} caption row${items.length === 1 ? '' : 's'}`, edit.receipts);
}

/** Key words by transcript row and exact phrase: the same row numbers as corrections, so a model
 *  never copies long word ids. A phrase missing from its row fails the whole call with the row text. */
function captionHighlights(document: EditorDocumentV2, highlights: Input, clipId: string | undefined): AgentTimelineOutcome {
  // clear with items replaces the key words: clear them all, then highlight the items.
  const rawItems = Array.isArray(highlights.items) ? highlights.items : [];
  const replace = highlights.clear === true && rawItems.length > 0;
  const color = highlights.clear === true && !replace ? 'off' : highlights.color === undefined ? 'style' : highlights.color;
  if (color !== 'style' && color !== 'off' && !(typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) {
    return fail('invalid_value', { path: 'highlights.color', value: color, fix: 'Use "style" (follow the caption highlight color), #RRGGBB, or "off" to clear.' });
  }
  const owner = captionTranscriptOwner(document, clipId, string(highlights.assetId));
  if (isOutcome(owner)) return owner;
  const { assetId } = owner;
  const segments = document.semantics.transcripts[assetId] as AsrSegment[] | undefined;
  if (!segments?.length) return fail('no transcript for this source — read get_transcript first');
  const patch: WordDecorationPatch = color === 'off' ? { highlight: null, color: null } : { highlight: 'color', color: color === 'style' ? null : color as string };
  const targets: { sentenceIndex: number; wordIndex: number }[] = [];
  let base = segments;
  if (replace) {
    const decorated: { sentenceIndex: number; wordIndex: number }[] = [];
    segments.forEach((segment, sentenceIndex) => Object.keys(segment.wordDecorations ?? {}).forEach((key) => decorated.push({ sentenceIndex, wordIndex: Number(key) })));
    base = decorated.length ? applyWordDecorations(segments, decorated, { highlight: null, color: null }) : segments;
  }
  if (highlights.clear === true && !replace) {
    segments.forEach((segment, sentenceIndex) => Object.keys(segment.wordDecorations ?? {}).forEach((key) => targets.push({ sentenceIndex, wordIndex: Number(key) })));
  } else {
    const items = rawItems.map((row) => { const value = (row ?? {}) as Input; return { index: Number(value.index), text: typeof value.text === 'string' ? value.text.trim() : '' }; });
    if (!items.length || items.some((item) => !Number.isInteger(item.index) || item.index < 0 || !item.text)) {
      return fail('invalid_value', { path: 'highlights.items', fix: 'items are {index, text}: index is the get_transcript row, text the exact word(s) copied from that row.' });
    }
    for (const item of items) {
      const segment = base[item.index];
      if (!segment) return fail(`index out of range: ${item.index} (this transcript has ${base.length} rows)`);
      const found = phraseWordIndexes(rowWords(segment), item.text);
      if (!found) return fail('invalid_value', { path: 'highlights.items', value: item, fix: `"${item.text}" is not in row ${item.index}: ${JSON.stringify(segment.captionText ?? segment.text)}. Copy the words exactly from that row.` });
      for (const wordIndex of found) targets.push({ sentenceIndex: item.index, wordIndex });
    }
  }
  if (!targets.length) return { ok: true, summary: 'No key words to clear' };
  const next = applyWordDecorations(base, targets, patch);
  const edit = applyCaptionDocumentEdit({
    document: { ...document, semantics: { ...document.semantics, transcripts: { ...document.semantics.transcripts, [assetId]: next } } },
    mainTranscript: null,
    clipTranscripts: {},
  });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  const n = targets.length;
  return mutation(edit.document, replace ? `Replaced the key words: highlighted ${n} word${n === 1 ? '' : 's'}` : color === 'off' ? `Cleared highlight on ${n} word${n === 1 ? '' : 's'}` : `Highlighted ${n} key word${n === 1 ? '' : 's'} (${color === 'style' ? 'caption highlight color' : color})`, edit.receipts);
}

function captionTranslations(document: EditorDocumentV2, translations: Input, clipId: string | undefined): AgentTimelineOutcome {
  const clear = translations.clear === true;
  const currentSub = document.appearance.captionStyle?.sub ?? {};
  const lang = string(translations.lang) ?? currentSub.lang;
  const items: CaptionTranslationItem[] = [];
  for (const row of Array.isArray(translations.items) ? translations.items : []) {
    const o = (row ?? {}) as Input;
    const index = Number(o.index);
    const text = typeof o.text === 'string' ? o.text.trim() : null;
    if (!Number.isInteger(index) || index < 0 || text === null) continue;
    const w0 = o.w0 === undefined ? undefined : Number(o.w0);
    const w1 = o.w1 === undefined ? undefined : Number(o.w1);
    if ((w0 === undefined) !== (w1 === undefined) || (w0 !== undefined && (!Number.isInteger(w0) || !Number.isInteger(w1) || w0 < 0 || w1! < w0))) {
      return fail('invalid_value', { path: 'translations.items', value: { index, w0, w1 }, fix: 'w0 and w1 are optional together: the first and last word of one cue, w0 <= w1' });
    }
    items.push(w0 === undefined ? { index, text } : { index, text, w0, w1: w1! });
  }
  if (!clear && !items.length) return fail('translations need {lang, items:[{index, text}]} or clear:true');
  let next = document;
  let summary: string;
  let subPatch: Record<string, unknown> | undefined;
  if (clear) {
    next = { ...next, semantics: { ...next.semantics, transcripts: Object.fromEntries(Object.entries(next.semantics.transcripts).map(([assetId, segments]) => [assetId, clearCaptionTranslations(segments as AsrSegment[])])) } };
    // The second line has nothing left to show; bilingual display follows the data.
    if (currentSub.lang) { const { lang: _lang, ...rest } = currentSub; subPatch = { sub: rest }; }
    summary = 'Cleared all caption translations';
  } else {
    if (!lang) return fail('translations need lang: the target language name (it also becomes the second caption line’s language)');
    const explicitAsset = string(translations.assetId);
    const owner = captionTranscriptOwner(next, clipId, explicitAsset);
    if (isOutcome(owner)) return owner;
    const { assetId } = owner;
    const segments = next.semantics.transcripts[assetId] as AsrSegment[] | undefined;
    if (!segments?.length) return fail(explicitAsset ? `no transcript for asset ${assetId}` : 'no transcript for this source — read get_transcript first');
    const bad = items.filter((row) => row.index >= segments.length);
    if (bad.length) return fail(`index out of range: ${bad.map((row) => row.index).join(', ')} (this transcript has ${segments.length} rows)`);
    next = { ...next, semantics: { ...next.semantics, transcripts: { ...next.semantics.transcripts, [assetId]: applyCaptionTranslations(segments, items, lang) } } };
    // Every entry (panel, chat, MCP) lands here, so the display language follows the write: a
    // translation nobody can see is not delivered.
    if (currentSub.lang !== lang) subPatch = { sub: { ...currentSub, lang } };
    summary = `Set ${items.filter((row) => row.text).length} translation${items.length === 1 ? '' : 's'}`;
  }
  const edit = applyCaptionDocumentEdit({ document: next, ...(subPatch ? { patch: subPatch } : {}), mainTranscript: null, clipTranscripts: {} });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, documentCaptionsOn(edit.document) ? summary : `${summary} (captions are off; they show after set_captions on:true)`, edit.receipts);
}

export function setCaptionsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const summaries: string[] = [];
  const data: Record<string, unknown> = {};
  const take = (outcome: AgentTimelineOutcome): AgentTimelineOutcome | null => {
    if (!outcome.ok) return outcome;
    if (outcome.document) next = outcome.document;
    receipts.push(...(outcome.receipts ?? []));
    if (outcome.summary) summaries.push(outcome.summary);
    if (outcome.data && typeof outcome.data === 'object') Object.assign(data, outcome.data as Record<string, unknown>);
    return null;
  };
  const clipId = string(input.clipId);

  if (input.on === false) {
    if (documentCaptionsOn(next)) {
      const edit = applyCaptionDocumentEdit({ document: next, patch: { on: false }, mainTranscript: null, clipTranscripts: {} });
      if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
      next = edit.document; receipts.push(...edit.receipts);
    }
    summaries.push('Captions off');
  }

  const preset = string(input.preset);
  if (preset && !CAPTION_PRESETS.some((entry) => entry.id === preset)) return fail('invalid_value', { path: 'preset', value: preset, allowed: CAPTION_PRESETS.map((entry) => entry.id) });
  if (input.animation !== undefined && !isCaptionAnimation(input.animation)) return fail('invalid_value', { path: 'animation', value: input.animation, allowed: CAPTION_ANIMATION_IDS });
  const yPct = captionYPctForCanvas(next.canvas, input.yPct);
  const patch: Record<string, number | string | undefined> = {};
  if (isCaptionAnimation(input.animation)) patch.animation = input.animation;
  else if (preset) patch.animation = captionAnimationId(next.appearance.captionStyle ?? {});
  if (typeof input.highlightColor === 'string') {
    if (input.highlightColor === 'animation') patch.emphasis = undefined;
    else if (/^#[0-9a-f]{6}$/i.test(input.highlightColor)) patch.emphasis = input.highlightColor;
    else return fail('invalid_value', { path: 'highlightColor', value: input.highlightColor, fix: 'Pass #RRGGBB, or "animation" for the animation\'s own color.' });
  }
  if (yPct != null) patch.yPct = yPct;
  if (isFiniteNumber(input.scale)) patch.scale = input.scale;
  if (typeof input.font === 'string') {
    if (input.font === 'preset') patch.font = undefined;
    else if (isDisplayTextFontId(input.font)) patch.font = input.font;
    else if (resolveWebFontReference(input.font)) patch.font = resolveWebFontReference(input.font)!;
    else return fail(`unknown caption font: ${input.font}. Use sans | serif | mono | local:<family> | preset, or a library font by id or name: ${webFontCatalogHint()}`);
  }
  const source = input.source && typeof input.source === 'object' ? (input.source as Input) : undefined;
  let captionSource = source
    ? string(source.trackId) ? { mode: 'track' as const, trackId: string(source.trackId)! }
      : string(source.clipId) ? { mode: 'clip' as const, clipId: string(source.clipId)! }
        : { mode: 'auto' as const }
    : undefined;
  // Agents place narration by asset id and refer to it the same way; resolve the asset to the
  // clip (or lane) that plays it.
  const sourceAssetId = source && captionSource?.mode === 'auto' ? string(source.assetId) : undefined;
  if (sourceAssetId) {
    const carriers = next.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => ('assetId' in clip && clip.assetId === sourceAssetId ? [{ trackId: track.id, clipId: clip.id }] : [])));
    if (!carriers.length) return fail('unknown_id', { path: 'source.assetId', value: sourceAssetId, fix: 'Place the asset with add_clips first, or pass source.clipId / source.trackId.' });
    const trackIds = new Set(carriers.map((carrier) => carrier.trackId));
    if (carriers.length > 1 && trackIds.size > 1) {
      return fail('ambiguous', { path: 'source.assetId', value: sourceAssetId, fix: `The asset plays on ${trackIds.size} tracks; pass source.trackId (${[...trackIds].join(', ')}) or source.clipId.` });
    }
    captionSource = carriers.length === 1
      ? { mode: 'clip' as const, clipId: carriers[0]!.clipId }
      : { mode: 'track' as const, trackId: carriers[0]!.trackId };
  }
  const script = typeof input.script === 'string' ? input.script.trim() : '';
  const styling = input.on === true || !!preset || Object.keys(patch).length > 0 || !!captionSource || !!script;

  if (script) {
    const lines = splitScriptLines(script);
    if (!lines.length) return fail('script is empty: provide the lines to show');
    // A voice-over says the script: its lines follow the narration's clock, not the picture's.
    const narrationTrack = next.timeline.tracks.find((track) => track.role === 'narration' && !track.muted
      && track.clips.some((clip) => clip.kind === 'audio' && clip.enabled !== false));
    const spineId = next.semantics.primaryNarrativeTrackId;
    const primary = spineId ? next.timeline.tracks.find((track) => track.id === spineId) : undefined;
    const shots = [...(primary?.clips ?? [])]
      .filter((clip) => clip.kind === 'narrative' && clip.enabled !== false)
      .sort((left, right) => left.startFrame - right.startFrame)
      .map((clip) => (clip.kind === 'narrative' ? { src: clip.assetId, srcStart: clip.sourceInSec, srcEnd: clip.sourceOutSec } : { srcStart: 0, srcEnd: 0 }));
    const voice = narrationTrack ? [...narrationTrack.clips]
      .filter((clip) => clip.kind === 'audio' && clip.enabled !== false)
      .sort((left, right) => left.startFrame - right.startFrame)
      .flatMap((clip) => (clip.kind === 'audio' ? [{ src: clip.assetId, srcStart: clip.sourceInSec, srcEnd: clip.sourceOutSec ?? clip.sourceInSec + clip.durationFrames / next.canvas.fps, timing: next.semantics.transcripts[clip.assetId] }] : [])) : [];
    const trackId = voice.length ? narrationTrack!.id : spineId;
    if (!trackId || (!voice.length && !shots.length)) return fail('no picture clips on the timeline can carry captions: assemble the picture first');
    const plan = voice.length ? planNarrationScriptSegments(voice, lines) : planScriptCaptionSegments(shots, lines);
    // Narration transcripts are written directly: the caption sync only takes picture-lane sources.
    const carrier = voice.length ? { ...next, semantics: { ...next.semantics, transcripts: { ...next.semantics.transcripts, ...plan.clips } } } : next;
    const edit = applyCaptionDocumentEdit({
      document: carrier,
      patch: { on: true, ...(preset ? { preset, color: undefined, bg: undefined } : {}), ...patch },
      source: { mode: 'track', trackId },
      mainTranscript: null,
      clipTranscripts: voice.length ? {} : plan.clips,
    });
    if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
    const captionTrack = edit.document.semantics.managedCaptionTrackId ? edit.document.timeline.tracks.find((track) => track.id === edit.document.semantics.managedCaptionTrackId) : undefined;
    if (!captionTrack?.clips.length) return fail('no picture clip could carry the script (sources without an audio track cannot hold transcript truth)');
    next = edit.document; receipts.push(...edit.receipts);
    summaries.push(`Captions laid from the script: ${plan.lineCount} lines`);
    data.source = 'script'; data.lines = plan.lineCount;
  } else if (styling && input.on !== false) {
    const turningOn = input.on === true || !!preset || !!captionSource;
    const stylePatch = { ...(turningOn ? { on: true } : {}), ...(preset ? { preset, color: undefined, bg: undefined } : {}), ...patch };
    // "Turn captions on" with no style is complete: the layer needs a preset to start, so use the default.
    if (input.on === true && !preset && !documentCaptionsOn(next)) stylePatch.preset = documentCaptionStyle(next).preset;
    // Captions already shown break into lines again when the change alters how much fits on one.
    const relayout = documentCaptionsOn(next) && captionPatchBreaksLines(next.appearance.captionStyle, stylePatch);
    const edit = applyCaptionDocumentEdit({ document: next, patch: stylePatch, ...(captionSource ? { source: captionSource } : {}), ...(relayout ? { relayout: true } : {}), mainTranscript: null, clipTranscripts: {} });
    if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
    if (turningOn) {
      const captionTrack = edit.document.semantics.managedCaptionTrackId ? edit.document.timeline.tracks.find((track) => track.id === edit.document.semantics.managedCaptionTrackId) : undefined;
      if (!captionTrack?.clips.length) return fail('no transcript for a placed caption source — read get_transcript (it transcribes when needed) or pass script for silent picture');
    }
    next = edit.document; receipts.push(...edit.receipts);
    const style = documentCaptionStyle(next);
    summaries.push(`${turningOn ? 'Captions on' : 'Captions adjusted'}: ${getCaptionPreset(style.preset).name}`);
  }

  if (Array.isArray(input.corrections) && input.corrections.length) {
    const source = (input.source ?? {}) as Input;
    const failed = take(captionCorrections(next, input.corrections as unknown[], clipId, string(source.assetId)));
    if (failed) return failed;
  }
  if (input.translations && typeof input.translations === 'object') {
    const failed = take(captionTranslations(next, input.translations as Input, clipId));
    if (failed) return failed;
  }
  if (input.relayout === true) {
    if (!documentCaptionsOn(next)) return fail('no captions to re-lay: turn them on first');
    const edit = applyCaptionDocumentEdit({ document: next, relayout: true, mainTranscript: null, clipTranscripts: {} });
    if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
    next = edit.document; receipts.push(...edit.receipts);
    summaries.push('Re-laid captions for the current canvas and font size');
  }
  if (input.highlights !== undefined) {
    const failed = take(captionHighlights(next, (input.highlights ?? {}) as Input, clipId));
    if (failed) return failed;
  }
  if (!summaries.length) return fail('nothing_to_change', { fix: CAPTION_FIX });
  return mutation(next, summaries.join('; '), receipts, Object.keys(data).length ? data : undefined);
}

/* ================================ speech ================================ */

export function maskWordsV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const parsed = parseMaskWordsInput(input);
  if ('error' in parsed) return fail(parsed.error);
  const resolved = resolveDocumentWordIds(document, parsed.ids);
  if (resolved.missing.length) return fail(`unknown or stale word ids: ${resolved.missing.join(', ')}`, { missing: resolved.missing, fix: 'Word ids shift after every cut; re-read get_transcript {granularity:"words"} and send the current ids.' });
  const transcripts = { ...document.semantics.transcripts };
  for (const [assetId, words] of groupWordsByAsset(resolved.words)) {
    const segments = transcripts[assetId] as AsrSegment[] | undefined;
    if (!segments) continue;
    transcripts[assetId] = applyWordMasks(segments, words, parsed.patch);
  }
  const edit = applyCaptionDocumentEdit({ document: { ...document, semantics: { ...document.semantics, transcripts } }, mainTranscript: null, clipTranscripts: {} });
  if (!edit.ok) return fail(edit.error.message, { code: edit.error.code, trackIds: edit.error.trackIds });
  return mutation(edit.document, maskWordsSummary(parsed.ids.length, parsed.patch), edit.receipts, { wordIds: parsed.ids, ...parsed.patch });
}

/* ============================== transcript ============================== */

const asAsr = (segments: TranscriptSegment[] | undefined): AsrSegment[] => desegmentCues((segments ?? []) as AsrSegment[]);

/** Narrative sources with cut marks, or a plain per-asset listing: source seconds either way. */
function formatTranscript(document: EditorDocumentV2, assetIds: readonly string[]): string {
  const rd = (x: number) => Math.round(x * 10) / 10;
  // Key words read back as highlights.items would write them: runs of marked words from the row.
  const keys = (segment: TranscriptSegment) => {
    const marks = (segment as AsrSegment).wordDecorations ?? {};
    const runs: string[][] = [];
    rowWords(segment as AsrSegment).forEach((word, index) => {
      if (!marks[String(index)]?.highlight) return;
      if (marks[String(index - 1)]?.highlight && runs.length) runs[runs.length - 1]!.push(word.text);
      else runs.push([word.text]);
    });
    return runs.length ? ` 〈key: ${runs.map((run) => joinWords(run)).join(' · ')}〉` : '';
  };
  const copy = (segment: TranscriptSegment) => (segment.captionText && segment.captionText !== segment.text ? `${segment.captionText} 〈ASR: ${segment.text}〉` : segment.text) + keys(segment);
  const narrativeShots = projectNarrativeShots(document);
  const spine = primaryNarrativeClips(document);
  const parts: string[] = [];
  for (const assetId of assetIds) {
    const asset = document.assets[assetId];
    const segments = asAsr(document.semantics.transcripts[assetId]);
    const spineClips = spine.filter((clip) => clip.assetId === assetId);
    const label = JSON.stringify(asset?.label || assetId);
    if (spineClips.length) {
      const shots = narrativeShots.filter((shot) => spineClips.some((clip) => clip.id === shot.id));
      const marks = narrationRowMarks(segments, shots, () => true, asset?.metadata.durationSec);
      const rows = segments.map((segment, index) => `  ${index}. [${rd(segment.start)}–${rd(segment.end)}s] ${marks.rows[index]!.prefix}${copy(segment)}${marks.rows[index]!.gapNote}`);
      const lines = [...(marks.head ? [`  ${marks.head}`] : []), ...rows, ...(marks.tail ? [`  ${marks.tail}`] : [])];
      const head = `NARRATIVE SOURCE ${label} (asset ${assetId}; clips ${spineClips.map((clip) => clip.id).join(', ')}; its own source seconds)`;
      parts.push(segments.length ? `${head}:\n${lines.join('\n')}` : `${head}: (no transcript stored)`);
    } else {
      const head = `${(asset?.kind ?? 'media').toUpperCase()} TRANSCRIPT ${label} (asset ${assetId}; source-file seconds)`;
      parts.push(segments.length ? `${head}:\n${segments.map((segment, index) => `  ${index}. [${rd(segment.start)}–${rd(segment.end)}s] ${copy(segment)}`).join('\n')}` : `${head}: (no speech)`);
    }
  }
  return parts.join('\n\n');
}

/** Which speech-bearing assets a get_transcript call addresses; null when a named target is unknown. */
export function transcriptTargets(document: EditorDocumentV2, input: Input): { assetIds: string[]; error?: string } {
  const ids = new Set<string>();
  const assetId = string(input.assetId);
  const clipId = string(input.clipId);
  const trackId = string(input.trackId);
  if (assetId) {
    if (!document.assets[assetId]) return { assetIds: [], error: `asset not found: ${assetId}` };
    ids.add(assetId);
  }
  if (clipId) {
    const found = locatedClip(document, clipId);
    if (found && 'assetId' in found.clip && found.clip.assetId) ids.add(found.clip.assetId);
    else if (document.assets[clipId]) ids.add(clipId); // a library asset id passed as clipId
    else return { assetIds: [], error: `clip not found or has no media asset: ${clipId} — pass timeline clip ids as clipId and asset ids as assetId` };
  }
  if (trackId) {
    const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return { assetIds: [], error: `track not found: ${trackId}` };
    for (const clip of track.clips) if ('assetId' in clip && clip.assetId) ids.add(clip.assetId);
  }
  if (!ids.size) {
    for (const clip of primaryNarrativeClips(document)) ids.add(clip.assetId);
    // A voice-over on its own lane (narration over muted footage) is the video's speech too.
    for (const track of document.timeline.tracks) if (track.role === 'narration' && !track.muted) {
      for (const clip of track.clips) if ('assetId' in clip && clip.assetId) ids.add(clip.assetId);
    }
    if (!ids.size) for (const [id, segments] of Object.entries(document.semantics.transcripts)) if (segments.length) ids.add(id);
  }
  return { assetIds: [...ids] };
}

export function getTranscriptV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const granularity = input.granularity ?? 'segments';
  if (granularity !== 'segments' && granularity !== 'words') return fail('invalid_value', { path: 'granularity', value: granularity, allowed: ['segments', 'words'] });
  const fps = document.canvas.fps;
  if (granularity === 'words') {
    if (!Object.values(document.semantics.transcripts).some((segments) => segments.length)) return fail('no transcript stored yet — call get_transcript (segments) first so the source is transcribed');
    if (input.fromFrame !== undefined && !isFrame(input.fromFrame)) return fail('fromFrame must be an integer frame ≥ 0');
    if (input.toFrame !== undefined && !isFrame(input.toFrame)) return fail('toFrame must be an integer frame ≥ 0');
    const query = {
      ...(string(input.clipId) ? { shotId: string(input.clipId) } : {}),
      ...(string(input.assetId) ? { assetId: string(input.assetId) } : {}),
      ...(string(input.trackId) ? { trackId: string(input.trackId) } : {}),
      ...(Array.isArray(input.segmentIndexes) ? { sentenceIndexes: input.segmentIndexes.map(Number).filter(Number.isInteger) } : {}),
      ...(isFrame(input.fromFrame) ? { fromSec: framesToSec(input.fromFrame, fps) } : {}),
      ...(isFrame(input.toFrame) ? { toSec: framesToSec(input.toFrame, fps) } : {}),
      ...(Number.isInteger(input.offset) ? { offset: input.offset as number } : {}),
      ...(Number.isInteger(input.limit) ? { limit: input.limit as number } : {}),
      // Rows asked for by index list their cut words too, so a wrongly cut passage restores by words.
      ...(Array.isArray(input.segmentIndexes) ? { includeCut: true } : {}),
    };
    const found = listDocumentAddressedWords(document, query);
    if ('error' in found) return fail(found.error);
    // Where each word plays now, in timeline frames, so placements never derive frames from source
    // seconds. The story spine first; a word playing nowhere has no frames.
    const playing = document.timeline.tracks
      .slice()
      .sort((a, b) => Number(b.id === document.semantics.primaryNarrativeTrackId) - Number(a.id === document.semantics.primaryNarrativeTrackId))
      .filter((track) => !track.hidden)
      .flatMap((track) => track.clips.filter((clip) => clip.enabled && 'assetId' in clip && 'sourceInSec' in clip && typeof clip.sourceInSec === 'number' && typeof clip.sourceOutSec === 'number' && clip.sourceOutSec > clip.sourceInSec));
    type Playing = (typeof playing)[number] & { assetId: string; sourceInSec: number; sourceOutSec: number };
    // A word a cut runs through still plays in part: its frames are the part that plays, and it is
    // marked clipped so a chopped onset or tail is visible (and restorable) rather than silent.
    const framesOf = (assetId: string, start: number, end: number): { frames: [number, number]; clipped: boolean } | undefined => {
      const overlapping = (playing as Playing[]).filter((c) => c.assetId === assetId && end > c.sourceInSec + 0.03 && start < c.sourceOutSec - 0.03);
      const c = overlapping[0];
      if (!c) return undefined;
      const scale = c.durationFrames / (c.sourceOutSec - c.sourceInSec);
      const from = Math.max(start, c.sourceInSec);
      const to = Math.min(end, c.sourceOutSec);
      const missing = [[start, from], [to, end]].some(([a, b]) => b! - a! > 0.05 && !overlapping.some((other) => other.sourceInSec <= a! + 0.01 && other.sourceOutSec >= b! - 0.01));
      return { frames: [Math.round(c.startFrame + (from - c.sourceInSec) * scale), Math.round(c.startFrame + (to - c.sourceInSec) * scale)], clipped: missing };
    };
    // Key words read back in set_captions.highlights vocabulary: "style" or the fixed #RRGGBB.
    // A word carries what the model edits with: its id, its text, where it plays (frames) and its
    // row address; the source asset is named once for the list, and source seconds stay out (every
    // word edit takes ids, every placement takes frames).
    const listed = { ...found, words: found.words.map((word) => {
      const decoration = (document.semantics.transcripts[word.assetId]?.[word.sentenceIndex] as AsrSegment | undefined)?.wordDecorations?.[String(word.wordIndex)];
      const placed = word.cut ? undefined : framesOf(word.assetId, word.start, word.end);
      return {
        id: word.id,
        text: word.text,
        ...(placed ? { startFrame: placed.frames[0], endFrame: placed.frames[1], ...(placed.clipped ? { clipped: true } : {}) } : {}),
        sentenceIndex: word.sentenceIndex,
        wordIndex: word.wordIndex,
        ...(word.cut ? { cut: true } : {}),
        ...(decoration?.highlight ? { highlight: decoration.color ?? 'style' } : {}),
      };
    }) };
    return {
      ok: true,
      summary: `Listed ${listed.words.length} transcript words`,
      data: listed.wordTiming === 'estimated'
        ? { ...listed, hint: 'word timing is ESTIMATED from sentence timing (script-backed source, not yet measured); the studio tab can measure it — call get_transcript {assetId} there before exact word edits' }
        : listed,
    };
  }
  const targets = transcriptTargets(document, input);
  if (targets.error) return fail(targets.error);
  if (!targets.assetIds.length) return fail('no speech-bearing source on the timeline or in the library');
  const stored = targets.assetIds.filter((id) => Object.prototype.hasOwnProperty.call(document.semantics.transcripts, id));
  if (!stored.length) return fail('transcript_missing', { assetIds: targets.assetIds, fix: 'These sources are not transcribed yet; the studio tab transcribes them when get_transcript runs there.' });
  const segments = stored.reduce((sum, id) => sum + (document.semantics.transcripts[id]?.length ?? 0), 0);
  return {
    ok: true,
    summary: segments ? `Read ${segments} transcript segments` : 'No speech in the selected source',
    data: {
      transcript: formatTranscript(document, stored),
      assetIds: stored,
      ...(targets.assetIds.length > stored.length ? { untranscribedAssetIds: targets.assetIds.filter((id) => !stored.includes(id)) } : {}),
    },
  };
}

/* ============================== inspection ============================== */

export function inspectMediaV3(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const mode = input.mode ?? 'metadata';
  const ids = Array.isArray(input.ids) ? (input.ids as unknown[]).map(string).filter((id): id is string => !!id) : [];
  if (mode === 'metadata') {
    const clipIds = Array.isArray(input.clipIds) ? (input.clipIds as unknown[]).map(string).filter((id): id is string => !!id) : [];
    // Models put library asset ids into clipId; an id that is not a clip on the active output is an asset.
    const extra = string(input.clipId) && !locatedClip(document, string(input.clipId)!) ? [string(input.clipId)!] : [];
    return inspectAssets(document, { assetIds: [...ids, ...extra], clipIds: [...clipIds, ...(string(input.clipId) && locatedClip(document, string(input.clipId)!) ? [string(input.clipId)!] : [])] });
  }
  if (mode === 'component') {
    if (ids.length !== 1) return fail('component mode inspects exactly one graphic clip id', { path: 'ids' });
    const block = projectOverlayBlockById(document, ids[0]!);
    if (!block) return fail(`graphic clip not found: ${ids[0]}`, { unknownIds: ids });
    const slots = block.slots as { innerHtml?: unknown; timelineBody?: unknown };
    const rendered = block.templateId === 'custom'
      ? { innerHtml: String(slots.innerHtml ?? ''), timelineBody: String(slots.timelineBody ?? '') }
      : renderBlock(block);
    const cap = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}\n…(truncated, ${text.length} chars total)` : text);
    const fps = document.canvas.fps;
    return {
      ok: true,
      summary: `"${blockName(block)}"`,
      data: {
        clipId: block.id,
        templateId: block.templateId,
        kind: blockKind(block),
        label: block.label,
        frames: [secondsToTimelineFrames(block.startSec, fps), secondsToTimelineFrames(block.startSec + block.durationSec, fps)],
        box: block.box ?? null,
        fitScale: block.fitScale ?? null,
        innerHtml: cap(rendered.innerHtml, 4000),
        timelineBody: cap(rendered.timelineBody, 2000),
        ...blockPropsReadback(block, document.appearance.look),
      },
    };
  }
  return fail(`inspect_media mode ${String(mode)} needs the live studio tab (media bytes, rendering or a paid analysis)`, { mode });
}

/* ================================ export ================================ */

export const V3_DOCUMENT_TOOL_IDS: ReadonlySet<string> = new Set([
  'add_clips', 'insert_clips', 'move_clips', 'remove_clips', 'split_clips', 'ripple_delete_ranges', 'swap_clip_media',
  'set_clip_properties', 'set_clip_framing', 'add_transition', 'set_canvas', 'apply_layout',
  'manage_tracks', 'manage_clip_links', 'set_texts', 'set_captions', 'mask_words', 'get_transcript', 'inspect_media',
]);

export function runV3DocumentTool(document: EditorDocumentV2, tool: string, input: Input): AgentTimelineOutcome | null {
  switch (tool) {
    case 'add_clips': return addClipsV3(document, input, 'overwrite');
    case 'insert_clips': return addClipsV3(document, input, 'ripple');
    case 'swap_clip_media': return swapClipMediaV3(document, input);
    case 'move_clips': return moveClipsV3(document, input);
    case 'remove_clips': return removeClipsV3(document, input);
    case 'split_clips': return splitClipsV3(document, input);
    case 'ripple_delete_ranges': return rippleDeleteRangesV3(document, input);
    case 'set_clip_properties': return setClipPropertiesV3(document, input);
    case 'set_clip_framing': return setClipFramingV3(document, input);
    case 'add_transition': return addTransitionV3(document, input);
    case 'set_canvas': return setCanvasV3(document, input);
    case 'apply_layout': return applyLayoutV3(document, input);
    case 'manage_tracks': return manageTracksV3(document, input);
    case 'manage_clip_links': return manageClipLinksV3(document, input);
    case 'set_texts': return setTextsV3(document, input);
    case 'set_captions': return setCaptionsV3(document, input);
    case 'mask_words': return maskWordsV3(document, input);
    case 'get_transcript': return getTranscriptV3(document, input);
    case 'inspect_media': return inspectMediaV3(document, input);
    case 'set_look': return setLookV3(document, input);
    case 'place_graphics': return placeGraphicsV3(document, input);
    case 'set_confirm_list': return setConfirmListV3(document, input);
    default: return null;
  }
}

export { positiveDurationFrames, timelineFramesToSeconds };
