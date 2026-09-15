/**
 * Document transactions — the unit of writing for the editor document.
 *
 * A transaction is a list of named operations with JSON inputs. Every operation is one of the
 * engine's pure document edits (`(document, input) => result`), so the same transaction produces the
 * same document wherever it runs: in the browser that authored it, on the server that stores it, or
 * in a second client that replays it after catching up. Nothing here reads the clock or a random
 * source; every identity an operation mints is either supplied by the caller or derived from the
 * document it runs on.
 *
 * Writers therefore never send a document snapshot. They send what they did, and whoever holds the
 * current truth applies it on top. Two writers touching different parts of a project no longer
 * collide at all; two writers touching the same field resolve in server order without anyone
 * having to compare version numbers first.
 */

import { applyPatch, type Operation as JsonPatchOperation } from 'fast-json-patch';
import type { AsrSegment } from './build-blocks';
import { canonicalJson, hashSection } from './stable-json';
import type { Block, Composition, VideoShot } from './composition-core';
import type { ProjectCloudMediaIndex } from './project-dto';
import type { LocalAssetIndexEntry } from './project-context';
import {
  applyEditorCommand,
  freezeEditorDocumentBlockVars,
  parseEditorDocumentV2,
  pruneEmptyNonPrimaryTracks,
  pruneUnusedEditorAssets,
  syncCaptionTranscripts,
  type EditorCommand,
  type EditorCommandError,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type NarrationSecondRange,
  type NarrativeClipPatchUpdate,
} from './editor-document';
import {
  applyEditorDocumentPersistenceMetadata,
  prepareEditorDocumentForPersistence,
  projectDocumentToComposition,
} from './project-document';
import { applyOverlayDocumentEdits, removeOverlayDocumentClips, type OverlayDocumentPatch } from './overlay-document-edit';
import {
  duplicateOverlayDocumentClip,
  insertOverlayDocumentClip,
  moveOverlayDocumentClip,
  reorderOverlayDocumentTracks,
  retimeOverlayDocumentClip,
  type DuplicateOverlayDocumentClipInput,
  type InsertOverlayDocumentClipInput,
  type MoveOverlayDocumentClipInput,
  type RetimeOverlayDocumentClipInput,
} from './overlay-track-edit';
import {
  addNarrativeDocumentClip,
  insertNarrativeAssetRange,
  moveNarrativeDocumentClip,
  moveNarrativeDocumentClipToVisualTrack,
  reorderNarrativeDocumentClips,
  type AddNarrativeDocumentClipInput,
  type InsertNarrativeAssetRangeInput,
  type MoveNarrativeDocumentClipInput,
  type MoveNarrativeDocumentClipToVisualTrackInput,
} from './narrative-document-edit';
import { applyNarrationDocumentEdit, removeNarrationClipsWithoutRipple } from './narration-document-edit';
import { moveVisualDocumentClip, type MoveVisualDocumentClipInput } from './visual-document-edit';
import { applyMediaVideoSettingsPatch, type MediaVideoSettingsPatch } from './media-video-edit';
import {
  addAudioDocumentClip,
  applyAudioDocumentEdits,
  moveAudioDocumentClip,
  removeAudioDocumentClips,
  splitAudioDocumentClip,
  type AddAudioDocumentClipInput,
  type AudioDocumentPatchInput,
  type MoveAudioDocumentClipInput,
} from './audio-document-edit';
import { applyCaptionDocumentEdit, resizeManagedCaptionTiming, type CaptionDocumentEditInput } from './caption-document-edit';
import { applyCanvasDocumentEdit } from './canvas-document-edit';
import { applyLayoutDocumentEdit, type LayoutDocumentEditInput, type LayoutDocumentEditResult } from './layout-document-edit';
import { applyGeneratedDraftDocument } from './generated-draft-document-edit';
import { patchNarrativeClips } from './editor-document/commands/narrative-patch';
import { applyNarrationSplitCommands } from './editor-document/commands/narration-split';
import { applyVideoClipSettingsPatches, type VideoClipSettingsPatchUpdate } from './media-video-edit';
import { applyMediaCropInput, applyMediaTransformInput, type AppliedMediaFramingUpdate } from './media-framing-edit';
import { applyDirectorPlanToDocument } from './director-plan-document';
import type { DirectorPlan } from './director-plan';
import { withSceneDesignsInSemantics, type SceneDesignCollection } from './scene-design';
import { bakeOverlayClipToMedia, type BakeOverlayClipToMediaInput } from './overlay-bake';
import {
  resizeNarrativeTimelineClip,
  resizeVisualTimelineClip,
  runAgentTimelineTool,
  slipNarrativeTimelineClip,
  type VisualTimelineResizeEdge,
} from './agent-timeline';

/* ================================ operations ================================ */

type Transcripts = {
  mainTranscript?: readonly AsrSegment[] | null;
  clipTranscripts?: Readonly<Record<string, readonly AsrSegment[]>>;
};

type WithoutDocument<T> = Omit<T, 'document'>;

/** Every operation's JSON input, keyed by operation name. */
export interface DocumentOpInputs {
  /** Whole-document replacement: undo, redo, restore, output switch. The one operation that is a snapshot. */
  'document.replace': { document: EditorDocumentV2 };
  /** The same restore as a JSON Patch against the document the writer held (`baseHash` = its
   *  canonical hash). Applies only on that exact document; anywhere else it fails with
   *  `stale-base` and the writer falls back to `document.replace`. */
  'document.patch': { baseHash: string; patch: readonly JsonPatchOperation[] };
  /** Fold session metadata (transcripts, cloud keys, library directory, source sig) into the document. */
  'document.foldMetadata': Transcripts & {
    plan?: unknown;
    cloudMedia?: ProjectCloudMediaIndex;
    localAssets?: readonly LocalAssetIndexEntry[];
    videoSig?: string | null;
    videoDurationSec?: number | null;
  };
  /** One primitive editor command (appearance, processing, clip/track patches, caption relay…). */
  'command': { command: EditorCommand };
  'overlay.patch': { updates: readonly OverlayDocumentPatch[] };
  'overlay.remove': { clipIds: readonly string[] };
  'overlay.insert': WithoutDocument<InsertOverlayDocumentClipInput>;
  'overlay.move': WithoutDocument<MoveOverlayDocumentClipInput>;
  'overlay.retime': WithoutDocument<RetimeOverlayDocumentClipInput>;
  'overlay.duplicate': WithoutDocument<DuplicateOverlayDocumentClipInput>;
  'overlay.reorderTracks': { topToBottomTrackIds: readonly string[] };
  'narrative.add': WithoutDocument<AddNarrativeDocumentClipInput>;
  'narrative.insertRange': WithoutDocument<InsertNarrativeAssetRangeInput>;
  'narrative.reorder': { clipIds: readonly string[] };
  'narrative.move': WithoutDocument<MoveNarrativeDocumentClipInput>;
  'narrative.moveToVisualTrack': WithoutDocument<MoveNarrativeDocumentClipToVisualTrackInput>;
  'narrative.patch': { updates: readonly NarrativeClipPatchUpdate[] };
  'narrative.resize': { clipId: string; edge: VisualTimelineResizeEdge; atSec: number };
  'narrative.slip': { clipId: string; sourceDeltaSec: number };
  'narration.removeRanges': Transcripts & { ranges: readonly NarrationSecondRange[] };
  'narration.removeClips': Transcripts & { clipIds: readonly string[] };
  'visual.move': WithoutDocument<MoveVisualDocumentClipInput>;
  'visual.resize': { clipId: string; edge: VisualTimelineResizeEdge; atSec: number };
  'media.videoSettings': { trackId: string; clipId: string; patch: MediaVideoSettingsPatch };
  'audio.add': WithoutDocument<AddAudioDocumentClipInput>;
  'audio.patch': WithoutDocument<AudioDocumentPatchInput>;
  'audio.move': WithoutDocument<MoveAudioDocumentClipInput>;
  'audio.remove': { clipIds: readonly string[] };
  'audio.split': { clipId: string; atSec: number };
  'captions.edit': Transcripts & WithoutDocument<Omit<CaptionDocumentEditInput, 'mainTranscript' | 'clipTranscripts'>>;
  'captions.resize': { clipId: string; edge: 'left' | 'right'; atSec: number };
  'canvas.resize': Transcripts & { width: number; height: number };
  'layout.apply': { layout: LayoutDocumentEditInput['layout'] };
  'generatedDraft.apply': { draft: Composition; plan?: unknown };
  'assets.prune': { assetIds: readonly string[] };
  /** One shared agent timeline tool call, run by the pure executor both surfaces already use. */
  'agent.timeline': { tool: string; input: Record<string, unknown> };
  /** Replace stored transcripts for the given assets verbatim (word masks, corrected words). */
  'transcripts.set': { transcripts: Readonly<Record<string, readonly AsrSegment[]>> };
  /** Merge metadata onto one registered asset (probed duration, spoken text of synthesised speech…). */
  'assets.patch': { assetId: string; label?: string; metadata?: Partial<EditorMediaAsset['metadata']> };
  'director.setPlan': { plan: DirectorPlan };
  'director.setSceneDesigns': { designs: SceneDesignCollection };
  'media.settingsPatches': { updates: readonly VideoClipSettingsPatchUpdate[] };
  'media.transform': { input: Record<string, unknown> };
  'media.crop': { input: Record<string, unknown> };
  'narration.split': { atSecs: readonly number[] };
  'overlay.bakeToMedia': WithoutDocument<BakeOverlayClipToMediaInput>;
  /** Register (or leave in place) one asset record, verbatim. Placement ops reference it by id. */
  'assets.register': { asset: EditorMediaAsset };
}

export type DocumentOpName = keyof DocumentOpInputs;

export interface DocumentOp<N extends DocumentOpName = DocumentOpName> {
  op: N;
  input: DocumentOpInputs[N];
}

/** Extra fields an operation reports next to the document when it succeeds. */
export interface DocumentOpResults {
  'document.replace': Record<never, never>;
  'document.patch': Record<never, never>;
  'document.foldMetadata': Record<never, never>;
  'command': Record<never, never>;
  'overlay.patch': Record<never, never>;
  'overlay.remove': Record<never, never>;
  'overlay.insert': { clipId?: string; trackId?: string; assetId?: string; sceneId?: string };
  'overlay.move': Record<never, never>;
  'overlay.retime': Record<never, never>;
  'overlay.duplicate': Record<never, never>;
  'overlay.reorderTracks': Record<never, never>;
  'narrative.add': { clipId?: string; assetId?: string };
  'narrative.insertRange': { clipId?: string; assetId?: string };
  'narrative.reorder': Record<never, never>;
  'narrative.move': { clipId?: string; assetId?: string };
  'narrative.moveToVisualTrack': { clipId?: string; assetId?: string };
  'narrative.patch': Record<never, never>;
  'narrative.resize': { summary?: string; data?: unknown };
  'narrative.slip': { summary?: string; data?: unknown };
  'narration.removeRanges': { composition: Composition; removedFrames: number };
  'narration.removeClips': { composition: Composition; removedFrames: number };
  'visual.move': { clipId: string; assetId: string };
  'visual.resize': { summary?: string; data?: unknown };
  'media.videoSettings': { shot: VideoShot };
  'audio.add': { clipId?: string; trackId?: string; assetId?: string };
  'audio.patch': Record<never, never>;
  'audio.move': { trackId?: string };
  'audio.remove': Record<never, never>;
  'audio.split': { newClipId?: string };
  'captions.edit': Record<never, never>;
  'captions.resize': Record<never, never>;
  'canvas.resize': { composition: Composition };
  'layout.apply': { layout: Extract<LayoutDocumentEditResult, { ok: true }>['layout'] };
  'generatedDraft.apply': Record<never, never>;
  'assets.prune': { removedAssetIds: string[] };
  'agent.timeline': { summary?: string; data?: unknown };
  'transcripts.set': Record<never, never>;
  'assets.patch': Record<never, never>;
  'director.setPlan': { createdClipIds: string[] };
  'director.setSceneDesigns': Record<never, never>;
  'media.settingsPatches': Record<never, never>;
  'media.transform': { updates: AppliedMediaFramingUpdate[] };
  'media.crop': { updates: AppliedMediaFramingUpdate[] };
  'narration.split': Record<never, never>;
  'overlay.bakeToMedia': { assetId: string; startFrame: number; durationFrames: number };
  'assets.register': { existed: boolean };
}

export type DocumentOpOutcome<N extends DocumentOpName = DocumentOpName> =
  | ({ ok: true; document: EditorDocumentV2 } & DocumentOpResults[N])
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export interface DocumentOpContext {
  projectId: string;
}

const fail = (document: EditorDocumentV2, code: EditorCommandError['code'], message: string): DocumentOpOutcome =>
  ({ ok: false, document, error: { code, message } });

/** Agent timeline outcomes report a string; the transaction layer speaks structured errors. */
function fromAgentOutcome(document: EditorDocumentV2, outcome: ReturnType<typeof runAgentTimelineTool>): DocumentOpOutcome<'agent.timeline'> {
  if (!outcome.ok) {
    const message = outcome.error ?? 'agent timeline tool failed';
    const missing = /does not exist|not found|unknown clip|unknown track/i.test(message);
    return { ok: false, document, error: { code: missing ? 'clip-not-found' : 'invalid-command', message } };
  }
  return { ok: true, document: outcome.document ?? document, ...(outcome.summary ? { summary: outcome.summary } : {}), ...(outcome.data !== undefined ? { data: outcome.data } : {}) };
}

const transcripts = (input: Transcripts) => ({
  mainTranscript: input.mainTranscript ? [...input.mainTranscript] : null,
  clipTranscripts: Object.fromEntries(Object.entries(input.clipTranscripts ?? {}).map(([key, value]) => [key, [...value]])),
});

type Handler<N extends DocumentOpName> = (document: EditorDocumentV2, input: DocumentOpInputs[N], ctx: DocumentOpContext) => DocumentOpOutcome<N>;

const strip = <T extends { ok: boolean; document: EditorDocumentV2 }>(result: T): T => {
  if (!result.ok) return result;
  const { receipts: _receipts, ...rest } = result as T & { receipts?: unknown };
  return rest as T;
};

const handlers: { [N in DocumentOpName]: Handler<N> } = {
  'document.replace': (_document, input) => ({ ok: true, document: input.document }),
  'document.patch': (document, input) => {
    if (hashSection(canonicalJson(document)) !== input.baseHash) {
      return fail(document, 'stale-base', 'The patch was made against a document this host does not hold') as DocumentOpOutcome<'document.patch'>;
    }
    let patched: unknown;
    try {
      patched = applyPatch(structuredClone(document) as unknown, input.patch as JsonPatchOperation[], true, false).newDocument;
    } catch (error) {
      return fail(document, 'invalid-document', `Patch does not apply: ${error instanceof Error ? error.message : String(error)}`) as DocumentOpOutcome<'document.patch'>;
    }
    const parsed = parseEditorDocumentV2(patched);
    if (!parsed) return fail(document, 'invalid-document', 'Patch result is not a V2 document') as DocumentOpOutcome<'document.patch'>;
    return { ok: true, document: parsed };
  },
  'document.foldMetadata': (document, input, ctx) => ({
    ok: true,
    document: applyEditorDocumentPersistenceMetadata({ projectId: ctx.projectId, document, ...input }),
  }),
  'command': (document, input) => {
    const result = applyEditorCommand(document, input.command);
    return result.ok ? { ok: true, document: result.document } : { ok: false, document, error: result.error };
  },
  'overlay.patch': (document, input) => strip(applyOverlayDocumentEdits({ document, updates: input.updates })),
  'overlay.remove': (document, input) => strip(removeOverlayDocumentClips({ document, clipIds: input.clipIds })),
  'overlay.insert': (document, input) => strip(insertOverlayDocumentClip({ document, ...input })),
  'overlay.move': (document, input) => strip(moveOverlayDocumentClip({ document, ...input })),
  'overlay.retime': (document, input) => strip(retimeOverlayDocumentClip({ document, ...input })),
  'overlay.duplicate': (document, input) => strip(duplicateOverlayDocumentClip({ document, ...input })),
  'overlay.reorderTracks': (document, input) => strip(reorderOverlayDocumentTracks(document, input.topToBottomTrackIds)),
  'narrative.add': (document, input) => strip(addNarrativeDocumentClip({ document, ...input })),
  'narrative.insertRange': (document, input) => strip(insertNarrativeAssetRange({ document, ...input })),
  'narrative.reorder': (document, input) => strip(reorderNarrativeDocumentClips(document, input.clipIds)),
  'narrative.move': (document, input) => strip(moveNarrativeDocumentClip({ document, ...input })),
  'narrative.moveToVisualTrack': (document, input) => strip(moveNarrativeDocumentClipToVisualTrack({ document, ...input })),
  'narrative.patch': (document, input) => {
    const result = patchNarrativeClips(document, input.updates);
    return result.ok ? { ok: true, document: result.document } : { ok: false, document, error: result.error };
  },
  'narrative.resize': (document, input) => fromAgentOutcome(document, resizeNarrativeTimelineClip(document, input.clipId, input.edge, input.atSec)),
  'narrative.slip': (document, input) => fromAgentOutcome(document, slipNarrativeTimelineClip(document, input.clipId, input.sourceDeltaSec)),
  'narration.removeRanges': (document, input, ctx) => strip(applyNarrationDocumentEdit({
    projectId: ctx.projectId, document, ranges: input.ranges, ...transcripts(input),
  })),
  'narration.removeClips': (document, input, ctx) => strip(removeNarrationClipsWithoutRipple({
    projectId: ctx.projectId, document, clipIds: input.clipIds, ...transcripts(input),
  })),
  'visual.move': (document, input) => strip(moveVisualDocumentClip({ document, ...input })),
  'visual.resize': (document, input) => fromAgentOutcome(document, resizeVisualTimelineClip(document, input.clipId, input.edge, input.atSec)),
  'media.videoSettings': (document, input) => {
    const result = applyMediaVideoSettingsPatch(document, input);
    if (result.ok) return { ok: true, document: result.document, shot: result.shot };
    const missing = /does not exist/i.test(result.error);
    return { ok: false, document, error: { code: missing ? 'clip-not-found' : 'invalid-command', message: result.error } };
  },
  'audio.add': (document, input) => strip(addAudioDocumentClip({ document, ...input })),
  'audio.patch': (document, input) => strip(applyAudioDocumentEdits({ document, updates: input.updates })),
  'audio.move': (document, input) => strip(moveAudioDocumentClip({ document, ...input })),
  'audio.remove': (document, input) => strip(removeAudioDocumentClips(document, input.clipIds)),
  'audio.split': (document, input) => strip(splitAudioDocumentClip(document, input.clipId, input.atSec)),
  'captions.edit': (document, input) => {
    const { mainTranscript: _main, clipTranscripts: _clips, ...rest } = input;
    return strip(applyCaptionDocumentEdit({ document, ...rest, ...transcripts(input) }));
  },
  'captions.resize': (document, input) => resizeManagedCaptionTiming(document, input.clipId, input.edge, input.atSec),
  'canvas.resize': (document, input, ctx) => strip(applyCanvasDocumentEdit({
    projectId: ctx.projectId, document, width: input.width, height: input.height, ...transcripts(input),
  })),
  'layout.apply': (document, input) => strip(applyLayoutDocumentEdit({
    document, composition: projectDocumentToComposition(document), layout: input.layout,
  })),
  'generatedDraft.apply': (document, input, ctx) => strip(applyGeneratedDraftDocument({
    projectId: ctx.projectId, document, draft: input.draft, ...(input.plan !== undefined ? { plan: input.plan } : {}),
  })),
  'assets.prune': (document, input) => {
    const result = pruneUnusedEditorAssets(document, input.assetIds);
    return { ok: true, document: result.document, removedAssetIds: result.removedAssetIds };
  },
  'agent.timeline': (document, input) => fromAgentOutcome(document, runAgentTimelineTool(document, input.tool, input.input)),
  'transcripts.set': (document, input) => {
    const transcripts = { ...document.semantics.transcripts };
    for (const [assetId, segments] of Object.entries(input.transcripts)) transcripts[assetId] = [...segments];
    return { ok: true, document: { ...document, semantics: { ...document.semantics, transcripts } } };
  },
  'assets.patch': (document, input) => {
    const asset = document.assets[input.assetId];
    if (!asset) return fail(document, 'clip-not-found', `Asset does not exist: ${input.assetId}`) as DocumentOpOutcome<'assets.patch'>;
    const next = {
      ...asset,
      ...(input.label !== undefined ? { label: input.label } : {}),
      metadata: { ...asset.metadata, ...(input.metadata ?? {}) },
    };
    return { ok: true, document: { ...document, assets: { ...document.assets, [input.assetId]: next } } };
  },
  'director.setPlan': (document, input) => {
    const result = applyDirectorPlanToDocument(document, input.plan);
    if (!result.ok) return fail(document, 'invalid-command', result.error) as DocumentOpOutcome<'director.setPlan'>;
    return { ok: true, document: result.document, createdClipIds: result.createdClipIds };
  },
  'director.setSceneDesigns': (document, input) => ({
    ok: true,
    document: { ...document, semantics: withSceneDesignsInSemantics(document.semantics, input.designs) },
  }),
  'media.settingsPatches': (document, input) => {
    const result = applyVideoClipSettingsPatches(document, input.updates);
    if (result.ok) return { ok: true, document: result.document };
    return { ok: false, document, error: { code: /does not exist/i.test(result.error) ? 'clip-not-found' : 'invalid-command', message: result.error } };
  },
  'media.transform': (document, input) => {
    const result = applyMediaTransformInput(document, input.input);
    if (result.ok) return { ok: true, document: result.document, updates: result.updates };
    return { ok: false, document, error: { code: /does not exist|not found/i.test(result.error) ? 'clip-not-found' : 'invalid-command', message: result.error } };
  },
  'media.crop': (document, input) => {
    const result = applyMediaCropInput(document, input.input);
    if (result.ok) return { ok: true, document: result.document, updates: result.updates };
    return { ok: false, document, error: { code: /does not exist|not found/i.test(result.error) ? 'clip-not-found' : 'invalid-command', message: result.error } };
  },
  'narration.split': (document, input) => strip(applyNarrationSplitCommands(document, input.atSecs)),
  'overlay.bakeToMedia': (document, input) => bakeOverlayClipToMedia({ document, ...input }),
  'assets.register': (document, input) => {
    if (document.assets[input.asset.id]) return { ok: true, document, existed: true };
    return { ok: true, document: { ...document, assets: { ...document.assets, [input.asset.id]: input.asset } }, existed: false };
  },
};

export const DOCUMENT_OP_NAMES: ReadonlySet<string> = new Set(Object.keys(handlers));

export function isDocumentOpName(value: unknown): value is DocumentOpName {
  return typeof value === 'string' && DOCUMENT_OP_NAMES.has(value);
}

/* ---------- JSON-safe inputs ----------
 * Patches in this codebase clear a field by setting it to `undefined` (a caption colour override,
 * a detached frame). JSON drops such keys, so an input that crossed the wire would stop clearing.
 * Inputs are therefore encoded before they are recorded — `undefined` becomes a sentinel object —
 * and decoded when applied, on every host alike. */
const UNDEFINED_SENTINEL = '$undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** Replace `undefined` values with a JSON-safe sentinel, recursively. Arrays keep their shape. */
export function encodeOpInput<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? { [UNDEFINED_SENTINEL]: true } : encodeOpInput(item))) as unknown as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = item === undefined ? { [UNDEFINED_SENTINEL]: true } : encodeOpInput(item);
  }
  return out as T;
}

/** Inverse of encodeOpInput. Inputs that never crossed the wire pass through unchanged. */
export function decodeOpInput<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => decodeOpInput(item)) as unknown as T;
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === UNDEFINED_SENTINEL && value[UNDEFINED_SENTINEL] === true) return undefined as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) out[key] = decodeOpInput(item);
  return out as T;
}

/** Run one operation. Failure leaves the input document untouched and reported as-is. */
export function applyDocumentOp<N extends DocumentOpName>(
  document: EditorDocumentV2,
  op: DocumentOp<N>,
  ctx: DocumentOpContext,
): DocumentOpOutcome<N> {
  const handler = handlers[op.op] as Handler<N> | undefined;
  if (!handler) return fail(document, 'invalid-command', `Unknown document operation: ${String(op.op)}`) as DocumentOpOutcome<N>;
  try {
    const outcome = handler(document, decodeOpInput(op.input), ctx);
    return outcome.ok ? outcome : { ...outcome, document };
  } catch (error) {
    return fail(document, 'invalid-command', error instanceof Error ? error.message : String(error)) as DocumentOpOutcome<N>;
  }
}

/* ================================ transactions ================================ */

export type DocumentTransactionOrigin = 'user' | 'agent' | 'system' | 'restore';

export interface DocumentTransaction {
  /** Client-minted, unique per project. Servers remember applied ids so a resend is a no-op. */
  id: string;
  origin: DocumentTransactionOrigin;
  ops: DocumentOp[];
}

export const DOCUMENT_TRANSACTION_MAX_OPS = 500;
export const DOCUMENT_TRANSACTION_ID = /^[A-Za-z0-9_-]{8,64}$/;

let transactionCounter = 0;
/** Ids are opaque; they only need to be unique per project across clients. */
export function createDocumentTransactionId(): string {
  transactionCounter += 1;
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  return `tx_${Date.now().toString(36)}_${transactionCounter.toString(36)}_${random}`;
}

/** The same normalization every writer applies after a transaction, so two hosts converge byte for byte. */
export function normalizeCommittedDocument(document: EditorDocumentV2): EditorDocumentV2 {
  const prepared = freezeEditorDocumentBlockVars(prepareEditorDocumentForPersistence(document));
  return pruneEmptyNonPrimaryTracks(prepared).document;
}

/** A missing target is the signature of an edit that raced a deletion; replaying it is a no-op, not a failure. */
export function isMissingTargetError(error: EditorCommandError): boolean {
  return error.code === 'clip-not-found' || error.code === 'track-not-found';
}

export interface ApplyTransactionOptions {
  /** Replay mode: skip operations whose target no longer exists instead of failing the transaction. */
  skipMissing?: boolean;
  /** Skip the post-transaction normalization (callers that normalize on publish). */
  raw?: boolean;
}

export type ApplyTransactionResult =
  | { ok: true; document: EditorDocumentV2; outcomes: DocumentOpOutcome[]; skipped: number; changed: boolean }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError; opIndex: number };

/** Apply a transaction atomically: any hard failure returns the input document unchanged. */
export function applyDocumentTransaction(
  document: EditorDocumentV2,
  transaction: Pick<DocumentTransaction, 'ops'>,
  ctx: DocumentOpContext,
  options: ApplyTransactionOptions = {},
): ApplyTransactionResult {
  let current = document;
  let skipped = 0;
  const outcomes: DocumentOpOutcome[] = [];
  for (const [opIndex, op] of transaction.ops.entries()) {
    const outcome = applyDocumentOp(current, op, ctx);
    if (!outcome.ok) {
      if (options.skipMissing && isMissingTargetError(outcome.error)) {
        skipped += 1;
        outcomes.push(outcome);
        continue;
      }
      return { ok: false, document, error: outcome.error, opIndex };
    }
    outcomes.push(outcome);
    current = outcome.document;
  }
  const next = options.raw || current === document ? current : normalizeCommittedDocument(current);
  return { ok: true, document: next, outcomes, skipped, changed: next !== document };
}

export interface ReplayResult {
  document: EditorDocumentV2;
  applied: string[];
  duplicates: string[];
  rejected: Array<{ id: string; error: EditorCommandError; opIndex: number }>;
  changed: boolean;
}

/**
 * Replay transactions onto the current truth, in order. Ids already known are skipped (a resend
 * after a lost response), missing targets are skipped inside a transaction, anything else rejects
 * that transaction alone and the rest continue — the writer learns which intent did not land.
 */
export function replayDocumentTransactions(
  document: EditorDocumentV2,
  transactions: readonly DocumentTransaction[],
  ctx: DocumentOpContext,
  alreadyApplied: ReadonlySet<string> = new Set(),
): ReplayResult {
  let current = document;
  const applied: string[] = [];
  const duplicates: string[] = [];
  const rejected: ReplayResult['rejected'] = [];
  const seen = new Set<string>();
  for (const transaction of transactions) {
    if (alreadyApplied.has(transaction.id) || seen.has(transaction.id)) {
      duplicates.push(transaction.id);
      continue;
    }
    seen.add(transaction.id);
    const result = applyDocumentTransaction(current, transaction, ctx, { skipMissing: true });
    if (!result.ok) {
      rejected.push({ id: transaction.id, error: result.error, opIndex: result.opIndex });
      continue;
    }
    current = result.document;
    applied.push(transaction.id);
  }
  return { document: current, applied, duplicates, rejected, changed: current !== document };
}

/** Wire-shape validation for a transaction list; inputs are validated by the operations themselves. */
export function sanitizeDocumentTransactions(value: unknown): DocumentTransaction[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const out: DocumentTransaction[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const tx = raw as Record<string, unknown>;
    if (typeof tx.id !== 'string' || !DOCUMENT_TRANSACTION_ID.test(tx.id)) return null;
    const origin = tx.origin === 'user' || tx.origin === 'agent' || tx.origin === 'system' || tx.origin === 'restore' ? tx.origin : null;
    if (!origin) return null;
    if (!Array.isArray(tx.ops) || tx.ops.length === 0 || tx.ops.length > DOCUMENT_TRANSACTION_MAX_OPS) return null;
    const ops: DocumentOp[] = [];
    for (const rawOp of tx.ops) {
      if (!rawOp || typeof rawOp !== 'object') return null;
      const op = rawOp as Record<string, unknown>;
      if (!isDocumentOpName(op.op) || !op.input || typeof op.input !== 'object' || Array.isArray(op.input)) return null;
      ops.push({ op: op.op, input: op.input as never });
    }
    out.push({ id: tx.id, origin, ops });
  }
  return out;
}

/** Transcript inputs are large; carry them only when they would change what the document already holds. */
export function transcriptInputsFor(
  document: EditorDocumentV2,
  mainTranscript: readonly AsrSegment[] | null | undefined,
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>> | undefined,
): Transcripts {
  const clips = clipTranscripts ?? {};
  const synced = syncCaptionTranscripts(document, mainTranscript ?? null, clips);
  if (synced === document) return {};
  // Only what changes the document travels: the browser's clip map covers every transcribed
  // library clip, most of which are not on the timeline, and the main transcript is usually already
  // folded. Each candidate is checked on its own against the document that already holds the main.
  const withMain = syncCaptionTranscripts(document, mainTranscript ?? null, {});
  const changedClips = Object.fromEntries(Object.entries(clips).filter(([key, segments]) =>
    segments.length > 0 && syncCaptionTranscripts(withMain, mainTranscript ?? null, { [key]: segments }) !== withMain));
  return {
    ...(withMain !== document ? { mainTranscript } : {}),
    ...(Object.keys(changedClips).length ? { clipTranscripts: changedClips } : {}),
  };
}

/** Helpers shared by editors that mint their own document ids: assets and clips of a Block. */
export type { Block, EditorMediaAsset };
