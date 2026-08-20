/** Shared pure Agent timeline executor. Live UI, offline server, and MCP all call this contract. */

import { applyAudioDocumentEdits } from './audio-document-edit';
import { applyOverlayDocumentEdits } from './overlay-document-edit';
import { insertOverlayDocumentClip } from './overlay-track-edit';
import { titleBlock } from './block-factory';
import {
  applyEditorCommand,
  editorTimelineTotalFrames,
  positiveDurationFrames,
  secondsToTimelineFrames,
  timelineFramesToSeconds,
  type AudioTimelineClip,
  type EditorCommandReceipt,
  type ClipPatch,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type EditorTrack,
  type EditorTrackRole,
  type EditorTrackType,
  type MediaTimelineClip,
  type NarrativeTimelineClip,
  type TimelineClip,
  type TimelineClipPlacement,
} from './editor-document';
import type { TranscriptSegment } from './project-dto';
import { directorPlanFromDocument } from './director-plan-artifact';
import { directorPlanToMarkdown } from './director-plan-markdown';
import { sceneDesignsFromDocument, sceneDesignsToMarkdown } from './scene-design';

export const AGENT_TIMELINE_TOOL_IDS = new Set([
  'get_timeline',
  'read_director_plan',
  'read_scene_designs',
  'register_media',
  'inspect_media',
  'organize_media',
  'add_clips',
  'insert_clips',
  'move_clips',
  'remove_clips',
  'split_clips',
  'set_video_speed',
  'set_clip_properties',
  'set_keyframes',
  'manage_tracks',
  'manage_clip_links',
  'sync_clips',
  'get_transcript',
  'get_beat_grid',
  'swap_clip_media',
  'add_texts',
  'update_text',
]);

export interface AgentTimelineOutcome {
  ok: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
  document?: EditorDocumentV2;
  receipts?: EditorCommandReceipt[];
}

type Input = Record<string, unknown>;

function fail(error: string, data?: unknown): AgentTimelineOutcome {
  return { ok: false, error, ...(data === undefined ? {} : { data }) };
}

function mutation(document: EditorDocumentV2, summary: string, receipts: EditorCommandReceipt[], data?: unknown): AgentTimelineOutcome {
  return { ok: true, summary, document, receipts, ...(data === undefined ? {} : { data }) };
}

function sec(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function mediaBox(value: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const x = Number(raw.x); const y = Number(raw.y); const w = Number(raw.w); const h = Number(raw.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
}

function unit(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : undefined;
}

function uniqueId(stem: string, used: ReadonlySet<string>): string {
  const clean = stem.replace(/[^A-Za-z0-9_-]+/g, '_') || 'item';
  let id = clean;
  let suffix = 2;
  while (used.has(id)) id = `${clean}_${suffix++}`;
  return id;
}

function splitSpeechSentences(text: string): string[] {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return [];
  return normalized.match(/[^。！？!?；;\n]+[。！？!?；;]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized];
}

/** Exact TTS/script text converted to deterministic provisional timings without another paid ASR call. */
export function transcriptFromExactText(text: string, durationSec: number): TranscriptSegment[] {
  const sentences = splitSpeechSentences(text);
  if (!sentences.length) return [];
  const duration = Math.max(0.3, durationSec);
  const weights = sentences.map((sentence) => Math.max(1, [...sentence].length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return sentences.map((sentence, index) => {
    const end = index === sentences.length - 1 ? duration : cursor + duration * (weights[index]! / total);
    const segment = { start: cursor, end, text: sentence };
    cursor = end;
    return segment;
  });
}

function clipForAgent(clip: TimelineClip, fps: number) {
  return {
    ...clip,
    startSec: timelineFramesToSeconds(clip.startFrame, fps),
    durationSec: timelineFramesToSeconds(clip.durationFrames, fps),
    endSec: timelineFramesToSeconds(clip.startFrame + clip.durationFrames, fps),
  };
}

export function agentTimelineSnapshot(document: EditorDocumentV2) {
  return {
    version: document.version,
    canvas: document.canvas,
    durationSec: timelineFramesToSeconds(editorTimelineTotalFrames(document), document.canvas.fps),
    tracks: document.timeline.tracks.map((track, index) => ({
      id: track.id,
      index,
      type: track.type,
      role: track.role,
      name: track.name,
      muted: track.muted,
      hidden: track.hidden,
      locked: track.locked,
      syncLocked: track.syncLocked,
      stackOrder: track.stackOrder,
      clips: track.clips.map((clip) => clipForAgent(clip, document.canvas.fps)),
    })),
    assets: Object.values(document.assets),
    semantics: {
      primaryNarrativeTrackId: document.semantics.primaryNarrativeTrackId,
      primaryNarrativeAssetId: document.semantics.primaryNarrativeAssetId,
      managedCaptionTrackId: document.semantics.managedCaptionTrackId,
      managedCaptionSource: document.semantics.managedCaptionSource ?? { mode: 'auto' },
      transcriptAssetIds: Object.entries(document.semantics.transcripts).filter(([, segments]) => segments.length).map(([assetId]) => assetId),
      scenes: document.semantics.scenes,
      directorPlan: (() => {
        const plan = directorPlanFromDocument(document);
        return plan ? {
          available: true,
          goal: plan.goal,
          creativeThesis: plan.creativeThesis,
          scenes: plan.scenes.map((scene) => ({
            id: scene.id,
            label: scene.label,
            startSec: timelineFramesToSeconds(scene.startFrame, document.canvas.fps),
            endSec: timelineFramesToSeconds(scene.startFrame + scene.durationFrames, document.canvas.fps),
          })),
        } : undefined;
      })(),
      sceneDesigns: (() => {
        const designs = sceneDesignsFromDocument(document);
        return designs?.scenes.length ? {
          available: true,
          path: 'scene-designs.md',
          sceneIds: designs.scenes.map((scene) => scene.sceneId),
        } : undefined;
      })(),
    },
  };
}

function locatedClip(document: EditorDocumentV2, clipId: string): { track: EditorTrack; clip: TimelineClip } | undefined {
  for (const track of document.timeline.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  return undefined;
}

function importAssets(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.assets) ? input.assets : input.asset ? [input.asset] : [];
  if (!items.length) return fail('assets is required');
  let assets = document.assets;
  let transcripts = document.semantics.transcripts;
  const imported: string[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const kind = item.kind === 'video' || item.kind === 'image' || item.kind === 'audio' ? item.kind : undefined;
    const requestedId = string(item.id) ?? string(item.assetId);
    if (!kind || !requestedId) return fail(`assets[${index}] requires id and kind`);
    const current = assets[requestedId];
    if (current && current.kind !== kind) return fail(`asset kind cannot change: ${requestedId}`);
    const locator = {
      ...(string(item.localSig) ? { localSig: string(item.localSig)! } : current?.locator.localSig ? { localSig: current.locator.localSig } : {}),
      ...(string(item.cloudKey) ? { cloudKey: string(item.cloudKey)! } : current?.locator.cloudKey ? { cloudKey: current.locator.cloudKey } : {}),
      ...(string(item.url) ? { remoteUrl: string(item.url)! } : current?.locator.remoteUrl ? { remoteUrl: current.locator.remoteUrl } : {}),
    };
    if (!locator.localSig && !locator.cloudKey && !locator.remoteUrl) return fail(`asset needs url, cloudKey, or localSig: ${requestedId}`);
    const declaredDurationSec = sec(item.durationSec, -1);
    const estimatedDurationSec = sec(item.estimatedDurationSec, -1);
    const initialDurationSec = declaredDurationSec > 0
      ? declaredDurationSec
      : estimatedDurationSec > 0
        ? estimatedDurationSec
        : undefined;
    const metadata: EditorMediaAsset['metadata'] = {
      ...current?.metadata,
      ...(initialDurationSec ? { durationSec: initialDurationSec } : {}),
      ...(sec(item.width, -1) > 0 ? { width: Math.round(sec(item.width)) } : {}),
      ...(sec(item.height, -1) > 0 ? { height: Math.round(sec(item.height)) } : {}),
      ...(typeof item.hasAudio === 'boolean' ? { hasAudio: item.hasAudio } : {}),
      ...(string(item.description) ? { description: string(item.description) } : {}),
      ...(Array.isArray(item.tags) ? { tags: item.tags.map(string).filter((tag): tag is string => !!tag).slice(0, 30) } : {}),
      ...(string(item.collection) ? { collection: string(item.collection) } : {}),
      ...(sec(item.bpm, -1) > 0 ? { bpm: sec(item.bpm) } : {}),
      ...(Number.isFinite(Number(item.beatOffsetSec)) ? { beatOffsetSec: Math.max(0, sec(item.beatOffsetSec)) } : {}),
    };
    assets = { ...assets, [requestedId]: { id: requestedId, kind, ...(string(item.label) ? { label: string(item.label) } : current?.label ? { label: current.label } : {}), locator, metadata } };
    const exactText = string(item.transcriptText);
    const supplied = Array.isArray(item.transcript) ? item.transcript.filter((segment): segment is TranscriptSegment => {
      const value = segment as Partial<TranscriptSegment>;
      return Number.isFinite(value.start) && Number.isFinite(value.end) && typeof value.text === 'string' && value.end! > value.start!;
    }) : [];
    const generated = exactText ? transcriptFromExactText(exactText, metadata.durationSec ?? 1) : supplied;
    if (generated.length) transcripts = { ...transcripts, [requestedId]: generated };
    imported.push(requestedId);
  }
  const next = { ...document, assets, semantics: { ...document.semantics, transcripts } };
  return mutation(next, `Imported ${imported.length} media asset${imported.length === 1 ? '' : 's'}`, [], { assetIds: imported });
}

function inspectAssets(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const requested = Array.isArray(input.assetIds) ? input.assetIds.map(string).filter((id): id is string => !!id) : [];
  const clipIds = Array.isArray(input.clipIds) ? input.clipIds.map(string).filter((id): id is string => !!id) : [];
  const ids = new Set(requested);
  for (const clipId of clipIds) {
    const found = locatedClip(document, clipId);
    if (found && 'assetId' in found.clip && found.clip.assetId) ids.add(found.clip.assetId);
  }
  const selected = ids.size ? [...ids] : Object.keys(document.assets);
  const assets = selected.map((assetId) => {
    const asset = document.assets[assetId];
    if (!asset) return { assetId, missing: true };
    const occurrences = document.timeline.tracks.flatMap((track) => track.clips
      .filter((clip) => 'assetId' in clip && clip.assetId === assetId)
      .map((clip) => ({ trackId: track.id, trackRole: track.role, clip: clipForAgent(clip, document.canvas.fps) })));
    return { ...asset, transcriptSegments: document.semantics.transcripts[assetId]?.length ?? 0, occurrences };
  });
  return { ok: true, summary: `Inspected ${assets.length} media asset${assets.length === 1 ? '' : 's'}`, data: { assets } };
}

function organizeAssets(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let assets = document.assets;
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const assetId = string(item.assetId);
    if (!assetId || !assets[assetId]) return fail(`items[${index}] asset not found`);
    const current = assets[assetId]!;
    assets = {
      ...assets,
      [assetId]: {
        ...current,
        ...(typeof item.label === 'string' ? { label: item.label.trim() || undefined } : {}),
        metadata: {
          ...current.metadata,
          ...(typeof item.description === 'string' ? { description: item.description.trim() || undefined } : {}),
          ...(Array.isArray(item.tags) ? { tags: item.tags.map(string).filter((tag): tag is string => !!tag).slice(0, 30) } : {}),
          ...(typeof item.collection === 'string' ? { collection: item.collection.trim() || undefined } : {}),
          ...(typeof item.bpm === 'number' && item.bpm > 0 ? { bpm: item.bpm } : {}),
          ...(typeof item.beatOffsetSec === 'number' && item.beatOffsetSec >= 0 ? { beatOffsetSec: item.beatOffsetSec } : {}),
        },
      },
    };
  }
  return mutation({ ...document, assets }, `Organized ${items.length} media asset${items.length === 1 ? '' : 's'}`, []);
}

function expectedTrack(asset: EditorMediaAsset, requestedRole?: string): { type: EditorTrackType; role: EditorTrackRole } {
  if (asset.kind === 'audio') {
    const role = requestedRole === 'music' || requestedRole === 'sfx' || requestedRole === 'narration' ? requestedRole : 'narration';
    return { type: 'audio', role };
  }
  if (asset.kind === 'video' && requestedRole === 'primary') {
    return { type: 'visual', role: 'primaryNarrative' };
  }
  return { type: 'visual', role: 'broll' };
}

function ensureTrack(
  document: EditorDocumentV2,
  asset: EditorMediaAsset,
  item: Input,
  placement?: { startFrame: number; durationFrames: number },
): { document: EditorDocumentV2; track: EditorTrack; receipts: EditorCommandReceipt[] } | AgentTimelineOutcome {
  const requestedId = string(item.trackId);
  if (requestedId) {
    const track = document.timeline.tracks.find((candidate) => candidate.id === requestedId);
    if (!track) return fail(`track not found: ${requestedId}`);
    return { document, track, receipts: [] };
  }
  const desired = expectedTrack(asset, string(item.role));
  const roleTracks = document.timeline.tracks.filter((track) => track.type === desired.type && track.role === desired.role);
  // A caller that omits trackId has not identified anything it intends to replace. Keep overlapping
  // visual evidence/backgrounds on parallel lanes; an exact trackId remains the explicit overwrite
  // escape hatch. Audio retains its semantic single-lane behavior.
  const existing = desired.role === 'primaryNarrative'
    ? roleTracks[0]
    : desired.type === 'visual' && placement
    ? roleTracks.find((track) => track.clips.every((clip) => (
        clip.startFrame + clip.durationFrames <= placement.startFrame
        || clip.startFrame >= placement.startFrame + placement.durationFrames
      )))
    : roleTracks[0];
  if (existing) return { document, track: existing, receipts: [] };
  const id = uniqueId(`track_${desired.role}`, new Set(document.timeline.tracks.map((track) => track.id)));
  const inserted = applyEditorCommand(document, {
    type: 'track.insert',
    track: { id, type: desired.type, role: desired.role, name: desired.role === 'broll' ? 'Visual media' : desired.role === 'narration' ? 'Narration' : desired.role.toUpperCase(), syncLocked: desired.role !== 'music' },
  });
  if (!inserted.ok) return fail(inserted.error.message, inserted.error);
  return { document: inserted.document, track: inserted.document.timeline.tracks.find((track) => track.id === id)!, receipts: [inserted.receipt] };
}

function placementFor(document: EditorDocumentV2, asset: EditorMediaAsset, item: Input, used: Set<string>): TimelineClipPlacement | AgentTimelineOutcome {
  const sourceInSec = Math.max(0, sec(item.sourceInSec));
  const explicitSourceOutSec = Number(item.sourceOutSec);
  const explicitDurationSec = Number(item.durationSec);
  const inferredDuration = Number.isFinite(explicitSourceOutSec) && explicitSourceOutSec > sourceInSec
    ? explicitSourceOutSec - sourceInSec
    : asset.kind === 'image'
      ? 5
      : asset.metadata.durationSec != null
        ? asset.metadata.durationSec - sourceInSec
        : 5;
  const requestedDuration = Number.isFinite(explicitDurationSec) ? explicitDurationSec : Math.max(0.2, inferredDuration);
  if (requestedDuration <= 0) return fail('durationSec must be positive');
  const durationFrames = positiveDurationFrames(requestedDuration, document.canvas.fps);
  const id = uniqueId(string(item.id) ?? `clip_${asset.id}`, used);
  used.add(id);
  const common = {
    id,
    offsetFrames: 0,
    durationFrames,
    enabled: item.enabled !== false,
    ...(string(item.linkGroupId) ? { linkGroupId: string(item.linkGroupId) } : {}),
  };
  if (asset.kind === 'audio') {
    const sourceOutSec = sec(item.sourceOutSec, sourceInSec + requestedDuration * Math.max(0.5, sec(item.speed, 1)));
    const clip: TimelineClipPlacement = {
      ...common,
      kind: 'audio',
      assetId: asset.id,
      sourceInSec,
      sourceOutSec,
      properties: {
        ...(typeof item.volumeDb === 'number' ? { volumeDb: item.volumeDb } : {}),
        ...(typeof item.fadeInSec === 'number' ? { fadeInSec: item.fadeInSec } : {}),
        ...(typeof item.fadeOutSec === 'number' ? { fadeOutSec: item.fadeOutSec } : {}),
        ...(typeof item.speed === 'number' ? { speed: item.speed } : {}),
        ...(typeof item.muted === 'boolean' ? { muted: item.muted } : {}),
      },
      anchor: { type: 'timeline' },
    } as AudioTimelineClip & { offsetFrames: number };
    return clip;
  }
  const wantsPrimary = string(item.role) === 'primary'
    || string(item.trackId) === document.semantics.primaryNarrativeTrackId;
  if (wantsPrimary && asset.kind !== 'video') {
    return fail('The primary narrative lane accepts video assets only; place images on a visual overlay lane.');
  }
  const box = item.box === undefined ? undefined : mediaBox(item.box);
  if (item.box !== undefined && !box) return fail('visual media box must be a positive normalized rect inside the canvas');
  const anchorX = item.anchorX === undefined ? undefined : unit(item.anchorX);
  const anchorY = item.anchorY === undefined ? undefined : unit(item.anchorY);
  const opacity = item.opacity === undefined ? undefined : unit(item.opacity);
  if (item.anchorX !== undefined && anchorX === undefined) return fail('anchorX must be within 0..1');
  if (item.anchorY !== undefined && anchorY === undefined) return fail('anchorY must be within 0..1');
  if (item.opacity !== undefined && opacity === undefined) return fail('opacity must be within 0..1');
  if (wantsPrimary) {
    return {
      ...common,
      kind: 'narrative',
      assetId: asset.id,
      sourceInSec,
      sourceOutSec: sec(item.sourceOutSec, sourceInSec + requestedDuration),
      ...(box ? { box } : {}),
      properties: {
        treatment: 'full',
        ...(typeof item.volumeDb === 'number' ? { volumeDb: item.volumeDb } : {}),
        ...(typeof item.muted === 'boolean' ? { audioMuted: item.muted } : {}),
      },
    } as NarrativeTimelineClip & { offsetFrames: number };
  }
  return {
    ...common,
    kind: 'media',
    assetId: asset.id,
    sourceInSec,
    sourceOutSec: sec(item.sourceOutSec, sourceInSec + requestedDuration),
    fit: item.fit === 'contain' ? 'contain' : 'cover',
    ...(box ? { box } : {}),
    ...(anchorX != null ? { anchorX } : {}),
    ...(anchorY != null ? { anchorY } : {}),
    ...(opacity != null ? { opacity } : {}),
  } as MediaTimelineClip & { offsetFrames: number };
}

export type VisualTimelineResizeEdge = 'left' | 'right';

function resizedMediaKeyframes(
  clip: MediaTimelineClip,
  newStartFrame: number,
  newDurationFrames: number,
): MediaTimelineClip['keyframes'] {
  if (!clip.keyframes) return undefined;
  const shift = clip.startFrame - newStartFrame;
  const rows = <T extends { frame: number }>(values: readonly T[] | undefined): T[] | undefined => values
    ?.map((value) => ({ ...value, frame: value.frame + shift }))
    .filter((value) => value.frame >= 0 && value.frame <= newDurationFrames);
  const box = rows(clip.keyframes.box);
  const opacity = rows(clip.keyframes.opacity);
  return {
    ...(box?.length ? { box } : {}),
    ...(opacity?.length ? { opacity } : {}),
  };
}

/** Trim/extend one ordinary visual-lane clip without changing its playback speed. */
export function resizeVisualTimelineClip(
  document: EditorDocumentV2,
  clipId: string,
  edge: VisualTimelineResizeEdge,
  atSec: number,
): AgentTimelineOutcome {
  if (!Number.isFinite(atSec)) return fail('visual clip resize time must be finite');
  const found = locatedClip(document, clipId);
  if (!found || found.track.type === 'audio' || found.clip.kind !== 'media') {
    return fail(`visual media clip not found: ${clipId}`);
  }
  if (found.track.locked) return fail(`track is locked: ${found.track.id}`);
  const asset = document.assets[found.clip.assetId];
  if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return fail(`visual asset not found: ${found.clip.assetId}`);

  const fps = document.canvas.fps;
  const minFrames = positiveDurationFrames(0.2, fps);
  const oldStartFrame = found.clip.startFrame;
  const oldEndFrame = oldStartFrame + found.clip.durationFrames;
  const siblings = found.track.clips
    .filter((clip) => clip.id !== clipId)
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  const previousEndFrame = siblings
    .filter((clip) => clip.startFrame + clip.durationFrames <= oldStartFrame)
    .reduce((end, clip) => Math.max(end, clip.startFrame + clip.durationFrames), 0);
  const nextStartFrame = siblings
    .filter((clip) => clip.startFrame >= oldEndFrame)
    .reduce((start, clip) => Math.min(start, clip.startFrame), Number.POSITIVE_INFINITY);
  const requestedFrame = secondsToTimelineFrames(Math.max(0, atSec), fps);
  const sourceRate = asset.kind === 'video'
    ? (found.clip.sourceOutSec - found.clip.sourceInSec) / timelineFramesToSeconds(found.clip.durationFrames, fps)
    : 0;

  let newStartFrame = oldStartFrame;
  let newEndFrame = oldEndFrame;
  let sourceInSec = found.clip.sourceInSec;
  let sourceOutSec = found.clip.sourceOutSec;
  if (edge === 'left') {
    const sourceFloorFrame = asset.kind === 'video' && sourceRate > 0
      ? oldStartFrame - secondsToTimelineFrames(sourceInSec / sourceRate, fps)
      : 0;
    newStartFrame = Math.max(previousEndFrame, sourceFloorFrame, Math.min(requestedFrame, oldEndFrame - minFrames));
    if (asset.kind === 'video' && sourceRate > 0) {
      sourceInSec = Math.max(0, sourceInSec + timelineFramesToSeconds(newStartFrame - oldStartFrame, fps) * sourceRate);
    }
  } else {
    const sourceCeilingFrame = asset.kind === 'video' && sourceRate > 0 && asset.metadata.durationSec != null
      ? oldEndFrame + secondsToTimelineFrames(Math.max(0, asset.metadata.durationSec - sourceOutSec) / sourceRate, fps)
      : Number.POSITIVE_INFINITY;
    newEndFrame = Math.min(nextStartFrame, sourceCeilingFrame, Math.max(requestedFrame, oldStartFrame + minFrames));
    if (asset.kind === 'video' && sourceRate > 0) {
      sourceOutSec += timelineFramesToSeconds(newEndFrame - oldEndFrame, fps) * sourceRate;
      if (asset.metadata.durationSec != null) sourceOutSec = Math.min(asset.metadata.durationSec, sourceOutSec);
    }
  }
  const newDurationFrames = newEndFrame - newStartFrame;
  if (newStartFrame === oldStartFrame && newDurationFrames === found.clip.durationFrames) {
    return mutation(document, 'Visual clip duration unchanged', [], {
      clipId, startSec: timelineFramesToSeconds(oldStartFrame, fps), endSec: timelineFramesToSeconds(oldEndFrame, fps),
    });
  }

  const resized: MediaTimelineClip = {
    ...found.clip,
    startFrame: newStartFrame,
    durationFrames: newDurationFrames,
    sourceInSec,
    sourceOutSec,
    keyframes: resizedMediaKeyframes(found.clip, newStartFrame, newDurationFrames),
  };
  const tracks = document.timeline.tracks.map((track) => track.id === found.track.id
    ? { ...track, clips: track.clips.map((clip) => clip.id === clipId ? resized : clip).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)) }
    : track);
  const next = { ...document, timeline: { ...document.timeline, tracks } };
  return mutation(next, `Resized visual clip to ${timelineFramesToSeconds(newDurationFrames, fps)}s`, [], {
    clipId,
    startSec: timelineFramesToSeconds(newStartFrame, fps),
    endSec: timelineFramesToSeconds(newEndFrame, fps),
    durationSec: timelineFramesToSeconds(newDurationFrames, fps),
    sourceInSec,
    sourceOutSec,
  });
}

function placeClips(document: EditorDocumentV2, input: Input, mode: 'overwrite' | 'ripple'): AgentTimelineOutcome {
  const items = Array.isArray(input.clips) ? input.clips : [];
  if (!items.length) return fail('clips is required');
  const used = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const created: string[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const assetId = string(item.assetId);
    const asset = assetId ? next.assets[assetId] : undefined;
    if (!asset) return fail(`clips[${index}] asset not found: ${assetId ?? ''}`);
    const placement = placementFor(next, asset, item, used);
    if ('ok' in placement) return placement;
    const atFrame = secondsToTimelineFrames(Math.max(0, sec(item.startSec, sec(input.atSec))), next.canvas.fps);
    const ensured = ensureTrack(
      next,
      asset,
      item,
      mode === 'overwrite' && asset.kind !== 'audio'
        ? { startFrame: atFrame, durationFrames: placement.durationFrames }
        : undefined,
    );
    if ('ok' in ensured) return ensured;
    next = ensured.document;
    receipts.push(...ensured.receipts);
    const inserted = applyEditorCommand(next, {
      type: 'clips.insert',
      trackId: ensured.track.id,
      atFrame,
      clips: [placement],
      mode,
      includeLinked: input.includeLinked !== false,
      ...(string(item.sceneId) ? { sceneId: string(item.sceneId) } : {}),
    });
    if (!inserted.ok) return fail(inserted.error.message, inserted.error);
    next = inserted.document;
    if (ensured.track.role === 'primaryNarrative') {
      const firstPrimary = ensured.track.id === inserted.document.semantics.primaryNarrativeTrackId
        ? inserted.document.timeline.tracks
            .find((track) => track.id === ensured.track.id)
            ?.clips
            .filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative')
            .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id))[0]
        : undefined;
      if (firstPrimary) {
        next = {
          ...next,
          semantics: { ...next.semantics, primaryNarrativeAssetId: firstPrimary.assetId },
        };
      }
    }
    receipts.push(inserted.receipt);
    created.push(placement.id);
  }
  const activePlacements = created.flatMap((clipId) => {
    const found = locatedClip(next, clipId);
    if (!found) return [];
    return [{
      clipId,
      trackId: found.track.id,
      ...('assetId' in found.clip ? { assetId: found.clip.assetId } : {}),
      startSec: timelineFramesToSeconds(found.clip.startFrame, next.canvas.fps),
      endSec: timelineFramesToSeconds(found.clip.startFrame + found.clip.durationFrames, next.canvas.fps),
      durationSec: timelineFramesToSeconds(found.clip.durationFrames, next.canvas.fps),
      ...((found.clip.kind === 'media' || found.clip.kind === 'narrative' || found.clip.kind === 'audio')
        ? { sourceInSec: found.clip.sourceInSec, sourceOutSec: found.clip.sourceOutSec }
        : {}),
    }];
  });
  const overwrittenClipIds = [...new Set(receipts.flatMap((receipt) => receipt.removedClipIds))];
  return mutation(
    next,
    `${mode === 'ripple' ? 'Inserted' : 'Added'} ${activePlacements.length} clip${activePlacements.length === 1 ? '' : 's'}${overwrittenClipIds.length ? `; replaced ${overwrittenClipIds.length}` : ''}`,
    receipts,
    {
      clipIds: activePlacements.map((placement) => placement.clipId),
      placements: activePlacements,
      ...(overwrittenClipIds.length ? { overwrittenClipIds } : {}),
    },
  );
}

function moveClips(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    const found = clipId ? locatedClip(next, clipId) : undefined;
    if (!found) return fail(`items[${index}] clip not found`);
    const moved = applyEditorCommand(next, {
      type: 'clip.move', trackId: found.track.id, clipId: found.clip.id,
      startFrame: secondsToTimelineFrames(Math.max(0, sec(item.startSec)), next.canvas.fps),
      ...(string(item.toTrackId) ? { toTrackId: string(item.toTrackId) } : {}),
      includeLinked: input.includeLinked !== false,
    });
    if (!moved.ok) return fail(moved.error.message, moved.error);
    next = moved.document;
    receipts.push(moved.receipt);
  }
  return mutation(next, `Moved ${items.length} clip${items.length === 1 ? '' : 's'}`, receipts);
}

function removeClips(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipIds = Array.isArray(input.clipIds) ? input.clipIds.map(string).filter((id): id is string => !!id) : [];
  if (!clipIds.length) return fail('clipIds is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const byTrack = new Map<string, string[]>();
  for (const id of clipIds) {
    const found = locatedClip(next, id);
    if (!found) return fail(`clip not found: ${id}`);
    byTrack.set(found.track.id, [...(byTrack.get(found.track.id) ?? []), id]);
  }
  for (const [trackId, ids] of byTrack) {
    // An earlier group may already remove linked partners on this track. Re-resolve against the
    // current document so a cross-track linked batch stays idempotent within this transaction.
    const remaining = ids.filter((id) => locatedClip(next, id)?.track.id === trackId);
    if (!remaining.length) continue;
    const removed = applyEditorCommand(next, { type: 'clips.remove', trackId, clipIds: remaining, includeLinked: input.includeLinked !== false });
    if (!removed.ok) return fail(removed.error.message, removed.error);
    next = removed.document;
    receipts.push(removed.receipt);
  }
  return mutation(next, `Removed ${clipIds.length} clip${clipIds.length === 1 ? '' : 's'}`, receipts);
}

function splitClips(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const created: string[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    const found = clipId ? locatedClip(next, clipId) : undefined;
    if (!found) return fail(`items[${index}] clip not found`);
    const split = applyEditorCommand(next, {
      type: 'clip.split', trackId: found.track.id, clipId: found.clip.id,
      atFrame: secondsToTimelineFrames(sec(item.atSec), next.canvas.fps), includeLinked: input.includeLinked !== false,
    });
    if (!split.ok) return fail(split.error.message, split.error);
    next = split.document;
    receipts.push(split.receipt);
    created.push(...split.receipt.createdClipIds);
  }
  return mutation(next, `Split ${items.length} clip${items.length === 1 ? '' : 's'}`, receipts, { createdClipIds: created });
}

function setVideoSpeed(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const speed = Number(input.speed);
  if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) return fail('speed must be within 0.25..4');
  const requestedIds = Array.isArray(input.shotIds)
    ? input.shotIds.map(string).filter((id): id is string => !!id)
    : [];
  if (!input.all && !requestedIds.length) return fail('shotIds or all:true is required');

  const videoLocations = document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    if ((clip.kind !== 'narrative' && clip.kind !== 'media') || document.assets[clip.assetId]?.kind !== 'video') return [];
    return [{ trackId: track.id, clip }];
  }));
  const ids = input.all ? videoLocations.map(({ clip }) => clip.id) : [...new Set(requestedIds)];
  const targets = ids.map((clipId) => {
    const found = videoLocations.find(({ clip }) => clip.id === clipId);
    return found ? { ...found, originalStartFrame: found.clip.startFrame } : null;
  });
  const missing = ids.filter((_clipId, index) => !targets[index]);
  if (missing.length) return fail(`video clip not found: ${missing.join(', ')}`);
  if (!targets.length) return fail('no video clips found');

  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const target of targets.filter((item): item is NonNullable<typeof item> => !!item)
    .sort((left, right) => left.originalStartFrame - right.originalStartFrame || left.clip.id.localeCompare(right.clip.id))) {
    const found = locatedClip(next, target.clip.id);
    if (!found || (found.clip.kind !== 'narrative' && found.clip.kind !== 'media')) return fail(`video clip not found: ${target.clip.id}`);
    const sourceDurationSec = found.clip.sourceOutSec - found.clip.sourceInSec;
    const retimed = applyEditorCommand(next, {
      type: 'clip.retime',
      trackId: found.track.id,
      clipId: found.clip.id,
      durationFrames: positiveDurationFrames(sourceDurationSec / speed, next.canvas.fps),
      ripple: typeof input.ripple === 'boolean' ? input.ripple : found.clip.kind === 'narrative',
    });
    if (!retimed.ok) return fail(retimed.error.message, retimed.error);
    next = retimed.document;
    receipts.push(retimed.receipt);
  }

  if (next.semantics.managedCaptionTrackId) {
    const relayed = applyEditorCommand(next, { type: 'captions.relay' });
    if (!relayed.ok) return fail(relayed.error.message, relayed.error);
    next = relayed.document;
    receipts.push(relayed.receipt);
  }
  return mutation(next, `Set ${targets.length} video clip${targets.length === 1 ? '' : 's'} to ${speed}x`, receipts, {
    clipIds: targets.map((target) => target!.clip.id),
    speed,
  });
}

function setClipProperties(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    let found = clipId ? locatedClip(next, clipId) : undefined;
    if (!found) return fail(`items[${index}] clip not found`);
    if (typeof item.startSec === 'number') {
      const moved = applyEditorCommand(next, { type: 'clip.move', trackId: found.track.id, clipId: found.clip.id, startFrame: secondsToTimelineFrames(Math.max(0, item.startSec), next.canvas.fps), includeLinked: false });
      if (!moved.ok) return fail(moved.error.message, moved.error);
      next = moved.document;
      receipts.push(moved.receipt);
      found = locatedClip(next, clipId!);
    }
    if (!found) return fail(`items[${index}] clip not found after move`);
    const commonPatch: ClipPatch = {
      ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      ...(item.fit === 'contain' || item.fit === 'cover' ? { fit: item.fit as 'contain' | 'cover' } : {}),
    };
    if (item.box !== undefined) {
      const box = mediaBox(item.box);
      if (!box) return fail(`items[${index}] box must be a positive normalized rect inside the canvas`);
      commonPatch.box = box;
    }
    if (item.anchorX !== undefined) {
      const value = unit(item.anchorX);
      if (value === undefined) return fail(`items[${index}] anchorX must be within 0..1`);
      commonPatch.anchorX = value;
    }
    if (item.anchorY !== undefined) {
      const value = unit(item.anchorY);
      if (value === undefined) return fail(`items[${index}] anchorY must be within 0..1`);
      commonPatch.anchorY = value;
    }
    if (item.opacity !== undefined) {
      const value = unit(item.opacity);
      if (value === undefined) return fail(`items[${index}] opacity must be within 0..1`);
      commonPatch.opacity = value;
    }
    if (Object.keys(commonPatch).length) {
      const patched = applyEditorCommand(next, { type: 'clip.patch', trackId: found.track.id, clipId: found.clip.id, patch: commonPatch });
      if (!patched.ok) return fail(patched.error.message, patched.error);
      next = patched.document;
      receipts.push(patched.receipt);
    }
    if (found.clip.kind === 'audio') {
      const audioPatch = {
        ...(typeof item.volumeDb === 'number' ? { volumeDb: item.volumeDb } : {}),
        ...(typeof item.fadeInSec === 'number' ? { fadeInSec: item.fadeInSec } : {}),
        ...(typeof item.fadeOutSec === 'number' ? { fadeOutSec: item.fadeOutSec } : {}),
        ...(typeof item.speed === 'number' ? { speed: item.speed } : {}),
        ...(typeof item.sourceInSec === 'number' ? { inSec: item.sourceInSec } : {}),
        ...(typeof item.sourceOutSec === 'number' ? { outSec: item.sourceOutSec } : {}),
        ...(typeof item.muted === 'boolean' ? { muted: item.muted } : {}),
      };
      if (Object.keys(audioPatch).length) {
        const edited = applyAudioDocumentEdits({ document: next, updates: [{ clipId: found.clip.id, patch: audioPatch }] });
        if (!edited.ok) return fail(edited.error.message, edited.error);
        next = edited.document;
        receipts.push(...edited.receipts);
      }
    }
  }
  return mutation(next, `Updated ${items.length} clip${items.length === 1 ? '' : 's'}`, receipts);
}

function setKeyframes(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipId = string(input.clipId);
  const property = string(input.property);
  const found = clipId ? locatedClip(document, clipId) : undefined;
  if (!found || found.clip.kind !== 'media') return fail('clipId must identify a visual media clip');
  if (property !== 'box' && property !== 'opacity') return fail('property must be box or opacity');
  if (!Array.isArray(input.keyframes)) return fail('keyframes is required');
  const fps = document.canvas.fps;
  const rowsByFrame = new Map<number, Record<string, number>>();
  for (const [index, raw] of input.keyframes.entries()) {
    if (!raw || typeof raw !== 'object') return fail(`keyframes[${index}] must be an object`);
    const row = raw as Input;
    const atSec = Number(row.atSec);
    if (!Number.isFinite(atSec) || atSec < 0) return fail(`keyframes[${index}].atSec must be a non-negative clip-local second`);
    const frame = secondsToTimelineFrames(atSec, fps);
    if (frame > found.clip.durationFrames) return fail(`keyframes[${index}] falls after the clip duration`);
    if (property === 'box') {
      const box = mediaBox(row);
      if (!box) return fail(`keyframes[${index}] requires finite canvas-relative x/y and positive w/h`);
      rowsByFrame.set(frame, { frame, ...box });
    } else {
      const value = unit(row.value);
      if (value === undefined) return fail(`keyframes[${index}].value must be within 0..1`);
      rowsByFrame.set(frame, { frame, value });
    }
  }
  const current = found.clip.keyframes ?? {};
  const ordered = [...rowsByFrame.values()].sort((left, right) => left.frame! - right.frame!);
  const keyframes = property === 'box'
    ? { ...current, box: ordered as Array<{ frame: number; x: number; y: number; w: number; h: number }> }
    : { ...current, opacity: ordered as Array<{ frame: number; value: number }> };
  if (!keyframes.box?.length) delete keyframes.box;
  if (!keyframes.opacity?.length) delete keyframes.opacity;
  const result = applyEditorCommand(document, {
    type: 'clip.patch', trackId: found.track.id, clipId: found.clip.id,
    patch: { keyframes: Object.keys(keyframes).length ? keyframes : null },
  });
  if (!result.ok) return fail(result.error.message, result.error);
  return mutation(result.document, `${ordered.length ? 'Set' : 'Cleared'} ${property} keyframes on clip ${clipId}`, [result.receipt], { clipId, property, keyframeCount: ordered.length });
}

function manageTracks(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const action = string(input.action);
  let result;
  if (action === 'create') {
    const type = input.type === 'visual' || input.type === 'graphics' || input.type === 'audio' || input.type === 'caption' ? input.type : undefined;
    if (!type) return fail('type is required for track creation');
    const id = string(input.trackId) ?? uniqueId(`track_${type}`, new Set(document.timeline.tracks.map((track) => track.id)));
    result = applyEditorCommand(document, { type: 'track.insert', track: {
      id, type, ...(string(input.role) ? { role: string(input.role) as EditorTrackRole } : {}), ...(string(input.name) ? { name: string(input.name) } : {}),
      ...(typeof input.muted === 'boolean' ? { muted: input.muted } : {}), ...(typeof input.hidden === 'boolean' ? { hidden: input.hidden } : {}),
      ...(typeof input.locked === 'boolean' ? { locked: input.locked } : {}), ...(typeof input.syncLocked === 'boolean' ? { syncLocked: input.syncLocked } : {}),
      ...(typeof input.stackOrder === 'number' ? { stackOrder: Math.trunc(input.stackOrder) } : {}),
    } });
  } else if (action === 'update') {
    const trackId = string(input.trackId);
    if (!trackId) return fail('trackId is required');
    result = applyEditorCommand(document, { type: 'track.patch', trackId, patch: {
      ...(typeof input.name === 'string' ? { name: input.name } : {}), ...(typeof input.muted === 'boolean' ? { muted: input.muted } : {}),
      ...(typeof input.hidden === 'boolean' ? { hidden: input.hidden } : {}), ...(typeof input.locked === 'boolean' ? { locked: input.locked } : {}),
      ...(typeof input.syncLocked === 'boolean' ? { syncLocked: input.syncLocked } : {}), ...(typeof input.stackOrder === 'number' ? { stackOrder: Math.trunc(input.stackOrder) } : {}),
    } });
  } else if (action === 'move') {
    const trackId = string(input.trackId);
    if (!trackId || !Number.isInteger(input.toIndex)) return fail('trackId and integer toIndex are required');
    result = applyEditorCommand(document, { type: 'track.move', trackId, toIndex: Number(input.toIndex) });
  } else if (action === 'remove') {
    const trackId = string(input.trackId);
    if (!trackId) return fail('trackId is required');
    result = applyEditorCommand(document, { type: 'track.remove', trackId });
  } else return fail('action must be create, update, move, or remove');
  if (!result.ok) return fail(result.error.message, result.error);
  return mutation(result.document, `${action === 'create' ? 'Created' : action === 'remove' ? 'Removed' : 'Updated'} track`, [result.receipt]);
}

function manageLinks(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipIds = Array.isArray(input.clipIds) ? input.clipIds.map(string).filter((id): id is string => !!id) : [];
  const action = string(input.action);
  const result = action === 'link'
    ? applyEditorCommand(document, { type: 'clips.link', clipIds, ...(string(input.groupId) ? { groupId: string(input.groupId) } : {}) })
    : action === 'unlink'
      ? applyEditorCommand(document, { type: 'clips.unlink', clipIds })
      : null;
  if (!result) return fail('action must be link or unlink');
  if (!result.ok) return fail(result.error.message, result.error);
  const groupId = action === 'link' ? locatedClip(result.document, clipIds[0]!)?.clip.linkGroupId : undefined;
  return mutation(result.document, `${action === 'link' ? 'Linked' : 'Unlinked'} ${clipIds.length} clips`, [result.receipt], { clipIds, ...(groupId ? { groupId } : {}) });
}

function syncClips(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const referenceClipId = string(input.referenceClipId);
  const reference = referenceClipId ? locatedClip(document, referenceClipId) : undefined;
  const targets = Array.isArray(input.targets) ? input.targets : [];
  if (!reference || !targets.length) return fail('referenceClipId and targets are required');
  const referenceMarkerSec = Math.max(0, sec(input.referenceMarkerSec));
  if (referenceMarkerSec > timelineFramesToSeconds(reference.clip.durationFrames, document.canvas.fps)) return fail('referenceMarkerSec falls after the reference clip');
  const referenceMarkerFrame = reference.clip.startFrame + secondsToTimelineFrames(referenceMarkerSec, document.canvas.fps);
  const desired = new Map<string, number>();
  for (const [index, raw] of targets.entries()) {
    const target = (raw ?? {}) as Input;
    const clipId = string(target.clipId);
    const found = clipId ? locatedClip(document, clipId) : undefined;
    if (!found || clipId === referenceClipId) return fail(`targets[${index}] must identify a different clip`);
    const markerSec = Number(target.markerSec);
    if (!Number.isFinite(markerSec) || markerSec < 0 || markerSec > timelineFramesToSeconds(found.clip.durationFrames, document.canvas.fps)) {
      return fail(`targets[${index}].markerSec must be inside the clip`);
    }
    desired.set(clipId!, referenceMarkerFrame - secondsToTimelineFrames(markerSec, document.canvas.fps));
  }
  const shiftFrames = Math.max(0, -Math.min(reference.clip.startFrame, ...desired.values()));
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  if (shiftFrames) {
    const movedReference = applyEditorCommand(next, {
      type: 'clip.move', trackId: reference.track.id, clipId: reference.clip.id,
      startFrame: reference.clip.startFrame + shiftFrames, includeLinked: false,
    });
    if (!movedReference.ok) return fail(movedReference.error.message, movedReference.error);
    next = movedReference.document;
    receipts.push(movedReference.receipt);
  }
  for (const [clipId, startFrame] of desired) {
    const found = locatedClip(next, clipId)!;
    const moved = applyEditorCommand(next, {
      type: 'clip.move', trackId: found.track.id, clipId, startFrame: startFrame + shiftFrames, includeLinked: false,
    });
    if (!moved.ok) return fail(moved.error.message, moved.error);
    next = moved.document;
    receipts.push(moved.receipt);
  }
  const clipIds = [referenceClipId!, ...desired.keys()];
  if (input.link !== false) {
    const linked = applyEditorCommand(next, { type: 'clips.link', clipIds });
    if (!linked.ok) return fail(linked.error.message, linked.error);
    next = linked.document;
    receipts.push(linked.receipt);
  }
  return mutation(next, `Synced ${desired.size} clip${desired.size === 1 ? '' : 's'} to ${referenceClipId}`, receipts, {
    referenceClipId, targetClipIds: [...desired.keys()], shiftedFrames: shiftFrames,
  });
}

function getTranscript(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const ids = new Set<string>();
  const assetId = string(input.assetId);
  const clipId = string(input.clipId);
  const trackId = string(input.trackId);
  if (assetId) ids.add(assetId);
  if (clipId) {
    const found = locatedClip(document, clipId);
    if (!found || !('assetId' in found.clip) || !found.clip.assetId) return fail(`clip has no transcript-bearing asset: ${clipId}`);
    ids.add(found.clip.assetId);
  }
  if (trackId) {
    const track = document.timeline.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return fail(`track not found: ${trackId}`);
    for (const clip of track.clips) if ('assetId' in clip && clip.assetId && document.semantics.transcripts[clip.assetId]?.length) ids.add(clip.assetId);
  }
  if (!ids.size) {
    const primary = document.semantics.primaryNarrativeAssetId;
    if (primary && document.semantics.transcripts[primary]?.length) ids.add(primary);
    else for (const [id, segments] of Object.entries(document.semantics.transcripts)) if (segments.length) ids.add(id);
  }
  const transcripts = [...ids].map((id) => ({
    assetId: id,
    asset: document.assets[id],
    segments: document.semantics.transcripts[id] ?? [],
    occurrences: document.timeline.tracks.flatMap((track) => track.clips
      .filter((clip) => 'assetId' in clip && clip.assetId === id)
      .map((clip) => ({ trackId: track.id, clipId: clip.id, startSec: timelineFramesToSeconds(clip.startFrame, document.canvas.fps), durationSec: timelineFramesToSeconds(clip.durationFrames, document.canvas.fps) }))),
  }));
  if (!transcripts.some((entry) => entry.segments.length)) return fail('no transcript for the selected source');
  return { ok: true, summary: `Read ${transcripts.reduce((sum, entry) => sum + entry.segments.length, 0)} transcript segments`, data: { transcripts } };
}

function getBeatGrid(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipId = string(input.clipId);
  const found = clipId ? locatedClip(document, clipId) : undefined;
  const assetId = string(input.assetId) ?? (found && 'assetId' in found.clip ? found.clip.assetId : undefined);
  const asset = assetId ? document.assets[assetId] : undefined;
  if (!asset) return fail('assetId or a media-bearing clipId is required');
  const bpm = sec(input.bpm, asset.metadata.bpm ?? 0);
  if (!(bpm > 0 && bpm <= 400)) return fail('known bpm within 1..400 is required; this tool does not analyze audio bytes');
  const subdivision = input.subdivision === 2 || input.subdivision === 4 ? input.subdivision : 1;
  const step = 60 / bpm / subdivision;
  const offset = Math.max(0, sec(input.offsetSec, asset.metadata.beatOffsetSec ?? 0));
  const sourceDuration = asset.metadata.durationSec ?? (found && (found.clip.kind === 'media' || found.clip.kind === 'narrative') ? found.clip.sourceOutSec : found?.clip.kind === 'audio' ? found.clip.sourceOutSec : undefined) ?? 0;
  const requestedStart = Math.max(0, sec(input.startSec));
  const requestedEnd = sec(input.endSec, found ? timelineFramesToSeconds(found.clip.startFrame + found.clip.durationFrames, document.canvas.fps) : sourceDuration);
  const beats: Array<{ index: number; sourceSec: number; timelineSec?: number; timelineFrame?: number }> = [];
  const firstIndex = Math.max(0, Math.ceil((0 - offset) / step));
  for (let index = firstIndex; beats.length < 1000; index++) {
    const sourceSec = offset + index * step;
    if (sourceDuration > 0 && sourceSec > sourceDuration + 1e-6) break;
    if (!found) {
      if (sourceSec >= requestedStart - 1e-6 && sourceSec <= requestedEnd + 1e-6) beats.push({ index, sourceSec });
      if (sourceSec > requestedEnd + 1e-6) break;
      continue;
    }
    let sourceInSec = 0;
    let sourceOutSec = sourceDuration;
    let rate = 1;
    if (found.clip.kind === 'media' || found.clip.kind === 'narrative') {
      sourceInSec = found.clip.sourceInSec;
      sourceOutSec = found.clip.sourceOutSec;
      rate = (sourceOutSec - sourceInSec) / timelineFramesToSeconds(found.clip.durationFrames, document.canvas.fps);
    } else if (found.clip.kind === 'audio') {
      sourceInSec = found.clip.sourceInSec;
      sourceOutSec = found.clip.sourceOutSec ?? sourceDuration;
      rate = found.clip.properties.speed ?? 1;
    } else return fail('clipId must identify media, narrative, or audio');
    if (sourceSec < sourceInSec - 1e-6) continue;
    if (sourceSec > sourceOutSec + 1e-6) break;
    const timelineSec = timelineFramesToSeconds(found.clip.startFrame, document.canvas.fps) + (sourceSec - sourceInSec) / Math.max(1e-9, rate);
    if (timelineSec < requestedStart - 1e-6) continue;
    if (timelineSec > requestedEnd + 1e-6) break;
    beats.push({ index, sourceSec, timelineSec, timelineFrame: secondsToTimelineFrames(timelineSec, document.canvas.fps) });
  }
  return {
    ok: true,
    summary: `${beats.length} beat-grid points at ${bpm} BPM`,
    data: { assetId, ...(clipId ? { clipId } : {}), bpm, offsetSec: offset, subdivision, beats, truncated: beats.length >= 1000 },
  };
}

function swapClipMedia(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const clipId = string(input.clipId);
  const assetId = string(input.assetId);
  const found = clipId ? locatedClip(document, clipId) : undefined;
  if (!found || !assetId) return fail('clipId and assetId are required');
  const result = applyEditorCommand(document, { type: 'clip.swapAsset', trackId: found.track.id, clipId: found.clip.id, assetId });
  if (!result.ok) return fail(result.error.message, result.error);
  return mutation(result.document, `Swapped media on clip ${clipId}`, [result.receipt], { clipId, assetId });
}

function addTexts(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const clipIds: string[] = [];
  const used = new Set(next.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const text = string(item.text);
    if (!text) return fail(`items[${index}] text is required`);
    const block = titleBlock({
      text,
      startSec: Math.max(0, sec(item.startSec)),
      durationSec: Math.max(0.2, sec(item.durationSec, 3)),
      ...(typeof item.trackIndex === 'number' ? { trackIndex: Math.round(item.trackIndex) } : {}),
      ...(string(item.sub) ? { sub: string(item.sub) } : {}),
    });
    block.id = uniqueId(string(item.id) ?? block.id, used);
    used.add(block.id);
    const inserted = insertOverlayDocumentClip({
      document: next,
      block,
      ...(string(item.trackId) ? { toTrackId: string(item.trackId) } : {}),
      ...(string(item.sceneId) ? { sceneId: string(item.sceneId) } : {}),
    });
    if (!inserted.ok) return fail(inserted.error.message, inserted.error);
    next = inserted.document;
    receipts.push(...inserted.receipts);
    clipIds.push(block.id);
  }
  return mutation(next, `Added ${clipIds.length} text clip${clipIds.length === 1 ? '' : 's'}`, receipts, { clipIds });
}

function updateTexts(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  const updates: Parameters<typeof applyOverlayDocumentEdits>[0]['updates'][number][] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const clipId = string(item.clipId);
    const found = clipId ? locatedClip(document, clipId) : undefined;
    if (!found || found.clip.kind !== 'graphic' || found.clip.block.templateId !== 'title') return fail(`items[${index}] is not a title text clip`);
    const text = typeof item.text === 'string' ? item.text.trim() : undefined;
    const sub = typeof item.sub === 'string' ? item.sub.trim() : undefined;
    updates.push({
      clipId: found.clip.id,
      ...(typeof item.startSec === 'number' ? { startSec: Math.max(0, item.startSec) } : {}),
      ...(typeof item.durationSec === 'number' ? { durationSec: Math.max(0.2, item.durationSec) } : {}),
      ...((text !== undefined || sub !== undefined) ? { block: {
        slots: { ...found.clip.block.slots, ...(text !== undefined ? { text } : {}), ...(sub !== undefined ? { sub } : {}) },
        ...(text !== undefined ? { label: text } : {}),
      } } : {}),
    });
  }
  const edited = applyOverlayDocumentEdits({ document, updates });
  if (!edited.ok) return fail(edited.error.message, edited.error);
  return mutation(edited.document, `Updated ${items.length} text clip${items.length === 1 ? '' : 's'}`, edited.receipts);
}

export function runAgentTimelineTool(document: EditorDocumentV2, tool: string, input: Input): AgentTimelineOutcome {
  switch (tool) {
    case 'get_timeline': return { ok: true, summary: `${document.timeline.tracks.length} timeline tracks`, data: agentTimelineSnapshot(document) };
    case 'read_director_plan': {
      const plan = directorPlanFromDocument(document);
      if (!plan) return fail('No Director Plan is saved for this output');
      const requested = Array.isArray(input.sceneIds)
        ? [...new Set(input.sceneIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
        : [];
      const scenes = requested.length ? plan.scenes.filter((scene) => requested.includes(scene.id)) : plan.scenes;
      if (!scenes.length) return fail(`No requested Director Scenes exist: ${requested.join(', ')}`);
      const content = directorPlanToMarkdown({ ...plan, scenes });
      return { ok: true, summary: `Loaded director-plan.md (${scenes.length} Scene${scenes.length === 1 ? '' : 's'})`, data: { path: 'director-plan.md', mediaType: 'text/markdown', content, sceneIds: scenes.map((scene) => scene.id), totalScenes: plan.scenes.length } };
    }
    case 'read_scene_designs': {
      const designs = sceneDesignsFromDocument(document);
      if (!designs) return fail('No Scene designs are saved for this output');
      const requested = Array.isArray(input.sceneIds)
        ? [...new Set(input.sceneIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
        : [];
      const scenes = requested.length ? designs.scenes.filter((scene) => requested.includes(scene.sceneId)) : designs.scenes;
      if (!scenes.length) return fail(`No requested Scene designs exist: ${requested.join(', ')}`);
      const content = sceneDesignsToMarkdown({ scenes });
      return { ok: true, summary: `Loaded scene-designs.md (${scenes.length} Scene${scenes.length === 1 ? '' : 's'})`, data: { path: 'scene-designs.md', mediaType: 'text/markdown', content, sceneIds: scenes.map((scene) => scene.sceneId), totalScenes: designs.scenes.length } };
    }
    case 'register_media': return importAssets(document, input);
    case 'inspect_media': return inspectAssets(document, input);
    case 'organize_media': return organizeAssets(document, input);
    case 'add_clips': return placeClips(document, input, 'overwrite');
    case 'insert_clips': return placeClips(document, input, 'ripple');
    case 'move_clips': return moveClips(document, input);
    case 'remove_clips': return removeClips(document, input);
    case 'split_clips': return splitClips(document, input);
    case 'set_video_speed': return setVideoSpeed(document, input);
    case 'set_clip_properties': return setClipProperties(document, input);
    case 'set_keyframes': return setKeyframes(document, input);
    case 'manage_tracks': return manageTracks(document, input);
    case 'manage_clip_links': return manageLinks(document, input);
    case 'sync_clips': return syncClips(document, input);
    case 'get_transcript': return getTranscript(document, input);
    case 'get_beat_grid': return getBeatGrid(document, input);
    case 'swap_clip_media': return swapClipMedia(document, input);
    case 'add_texts': return addTexts(document, input);
    case 'update_text': return updateTexts(document, input);
    default: return fail(`unsupported timeline tool: ${tool}`);
  }
}
