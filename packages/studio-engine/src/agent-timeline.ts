/** Shared pure Agent timeline executor. Live UI, offline server, and MCP all call this contract. */

import { applyAudioDocumentEdits, ensureFreeAudioDocumentTrack } from './audio-document-edit';
import { applyOverlayDocumentEdits } from './overlay-document-edit';
import { insertOverlayDocumentClip } from './overlay-track-edit';
import { titleBlock } from './block-factory';
import {
  applyEditorCommand,
  editorTimelineTotalFrames,
  positiveDurationFrames,
  retimeEditorClip,
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
  normalizePeerNarrativeSources,
} from './editor-document';
import type { TranscriptSegment } from './project-dto';
import { directorPlanFromDocument } from './director-plan-artifact';
import { directorPlanToMarkdown } from './director-plan-markdown';
import { sceneDesignsFromDocument, sceneDesignsToMarkdown } from './scene-design';
import { canvasSizeFollowingFirstVideo } from './editing-primitives';
import { placementPercentToBox } from './overlay-placement';
import { isDisplayTextAnimationId, isDisplayTextFontId, isDisplayTextPresetId } from './display-text-presets';

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

function frameDeltaSec(frames: number, fps: number): number {
  return Number.isFinite(frames) && Number.isFinite(fps) && fps > 0 ? frames / fps : 0;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function freeGraphicsStackOrder(document: EditorDocumentV2, startSec: number, durationSec: number): number {
  const startFrame = secondsToTimelineFrames(startSec, document.canvas.fps);
  const endFrame = startFrame + positiveDurationFrames(durationSec, document.canvas.fps);
  for (let stackOrder = 2; ; stackOrder++) {
    const track = document.timeline.tracks.find((candidate) => candidate.type === 'graphics' && candidate.stackOrder === stackOrder);
    if (!track || !track.clips.some((clip) => clip.startFrame < endFrame && clip.startFrame + clip.durationFrames > startFrame)) {
      return stackOrder;
    }
  }
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
  const durationSec = timelineFramesToSeconds(clip.durationFrames, fps);
  const sourceInSec = 'sourceInSec' in clip ? Number(clip.sourceInSec) : NaN;
  const sourceOutSec = 'sourceOutSec' in clip ? Number(clip.sourceOutSec) : NaN;
  const playbackSpeed = Number.isFinite(sourceInSec) && Number.isFinite(sourceOutSec)
    ? (sourceOutSec - sourceInSec) / Math.max(1 / fps, durationSec)
    : undefined;
  return {
    ...clip,
    startSec: timelineFramesToSeconds(clip.startFrame, fps),
    durationSec,
    endSec: timelineFramesToSeconds(clip.startFrame + clip.durationFrames, fps),
    ...(playbackSpeed != null ? { playbackSpeed } : {}),
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
    const sameSource = Object.values(assets).find((candidate) => candidate.id !== requestedId && (
      (locator.localSig && candidate.locator.localSig === locator.localSig)
      || (locator.cloudKey && candidate.locator.cloudKey === locator.cloudKey)
      || (locator.remoteUrl && candidate.locator.remoteUrl === locator.remoteUrl)
    ));
    const declaredDurationSec = sec(item.durationSec, -1);
    const estimatedDurationSec = sec(item.estimatedDurationSec, -1);
    const initialDurationSec = declaredDurationSec > 0
      ? declaredDurationSec
      : estimatedDurationSec > 0
        ? estimatedDurationSec
        : undefined;
    const metadata: EditorMediaAsset['metadata'] = {
      ...sameSource?.metadata,
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
    assets = { ...assets, [requestedId]: { id: requestedId, kind, ...(string(item.label) ? { label: string(item.label) } : current?.label ? { label: current.label } : sameSource?.label ? { label: sameSource.label } : {}), locator, metadata } };
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
  // visual evidence/backgrounds and synchronous SFX on parallel free lanes; an exact trackId remains
  // the explicit overwrite escape hatch. Narration and music retain their semantic single-lane behavior.
  if (placement && desired.type === 'audio' && desired.role === 'sfx') {
    const allocated = ensureFreeAudioDocumentTrack({
      document,
      role: 'sfx',
      startFrame: placement.startFrame,
      durationFrames: placement.durationFrames,
      syncLocked: true,
    });
    if (!allocated.ok) return fail(allocated.error.message, allocated.error);
    return { document: allocated.document, track: allocated.track, receipts: allocated.receipts };
  }
  const useFreeLane = !!placement && desired.type === 'visual' && desired.role !== 'primaryNarrative';
  if (useFreeLane && asset.kind === 'video' && item.box === undefined) {
    // A full-frame B-roll video never stacks on another full-frame B-roll video: the upper lane hides
    // the lower one completely, so the overlap is always a contradiction in the caller's plan (a
    // re-placement of what is already there, or a batch that overlaps itself) — never a composition.
    // Silently opening one more lane per attempt let an agent pile seven layers of "B-roll" on one
    // narration. Refuse with the exact conflict so the caller fixes the frames or removes the earlier
    // clip; an explicit trackId remains the deliberate overwrite path. Boxed inserts (PiP, evidence
    // over a background) and images keep their parallel lanes.
    const endFrame = placement.startFrame + placement.durationFrames;
    const overlaps = roleTracks.flatMap((track) => track.clips.flatMap((clip) => (
      clip.kind === 'media'
      && !clip.box
      && document.assets[clip.assetId]?.kind === 'video'
      && clip.startFrame < endFrame
      && clip.startFrame + clip.durationFrames > placement.startFrame
        ? [{ trackId: track.id, clipId: clip.id, assetId: clip.assetId, frames: [clip.startFrame, clip.startFrame + clip.durationFrames] as [number, number] }]
        : []
    )));
    if (overlaps.length) {
      const first = overlaps[0]!;
      return fail(
        `${asset.id} at frames ${placement.startFrame}–${endFrame} overlaps the full-frame B-roll video ${first.clipId} (frames ${first.frames[0]}–${first.frames[1]}) on ${first.trackId}${overlaps.length > 1 ? ` and ${overlaps.length - 1} more` : ''}. Full-frame B-roll videos never stack: the upper one would hide the lower one completely. Choose frames inside a free gap, remove or move the existing clip first, or pass trackId: '${first.trackId}' to overwrite that lane deliberately. Nothing was placed.`,
        { reason: 'broll_overlap', overlaps },
      );
    }
  }
  const existing = desired.role === 'primaryNarrative'
    ? roleTracks[0]
    : useFreeLane
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
    const role = string(item.role) ?? 'narration';
    const requestedVolumeDb = typeof item.volumeDb === 'number' ? item.volumeDb : undefined;
    const initialVolumeDb = role === 'narration'
      ? Math.max(4, requestedVolumeDb ?? 4)
      : role === 'music'
        ? Math.min(-24, requestedVolumeDb ?? -24)
        : requestedVolumeDb;
    const sourceOutSec = sec(item.sourceOutSec, sourceInSec + requestedDuration * Math.max(0.5, sec(item.speed, 1)));
    const clip: TimelineClipPlacement = {
      ...common,
      kind: 'audio',
      assetId: asset.id,
      sourceInSec,
      sourceOutSec,
      properties: {
        ...(initialVolumeDb != null ? { volumeDb: initialVolumeDb } : {}),
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
    const sourceOutSec = sec(item.sourceOutSec, sourceInSec + requestedDuration);
    const sourceDurationSec = sourceOutSec - sourceInSec;
    if (!(sourceDurationSec > 0)) return fail('primary video sourceOutSec must be after sourceInSec');
    if (typeof item.speed === 'number' && Math.abs(item.speed - 1) > 1e-6) {
      return fail('Primary clips are placed at natural speed. Remove speed and make durationSec match the selected source range; use set_video_speed only for an intentional creative retime, never to fill narration time.');
    }
    const naturalDurationFrames = positiveDurationFrames(sourceDurationSec, document.canvas.fps);
    if (Number.isFinite(explicitDurationSec) && Math.abs(durationFrames - naturalDurationFrames) > 2) {
      return fail(`Primary clip durationSec must match its ${sourceDurationSec.toFixed(3)}s source range at natural speed. Add another usable source interval or revise narration instead of stretching footage.`);
    }
    return {
      ...common,
      durationFrames: naturalDurationFrames,
      kind: 'narrative',
      assetId: asset.id,
      sourceInSec,
      sourceOutSec,
      ...(box ? { box } : {}),
      properties: {
        treatment: 'full',
        preciseFraming: {
          scale: 1,
          anchorX: anchorX ?? 0.5,
          anchorY: anchorY ?? 0.5,
          coordinateSpace: 'source-normalized',
        },
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
    // Overlay media keeps its audio settings under `video` (the shot-scoped controls); without this
    // a `muted: true` on a broll row was silently dropped and the source sound played over narration.
    ...(typeof item.muted === 'boolean' ? { video: { treatment: 'full', audioMuted: item.muted } } : {}),
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
      sourceInSec = Math.max(0, sourceInSec + frameDeltaSec(newStartFrame - oldStartFrame, fps) * sourceRate);
    }
  } else {
    const sourceCeilingFrame = asset.kind === 'video' && sourceRate > 0 && asset.metadata.durationSec != null
      ? oldEndFrame + secondsToTimelineFrames(Math.max(0, asset.metadata.durationSec - sourceOutSec) / sourceRate, fps)
      : Number.POSITIVE_INFINITY;
    newEndFrame = Math.min(nextStartFrame, sourceCeilingFrame, Math.max(requestedFrame, oldStartFrame + minFrames));
    if (asset.kind === 'video' && sourceRate > 0) {
      sourceOutSec += frameDeltaSec(newEndFrame - oldEndFrame, fps) * sourceRate;
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

/** Trim/extend one primary narrative clip from its own edge. Edge extensions on a packed primary
 * track ripple later sync-locked material so source handles can be restored without overlap. A
 * transition attached to the changed cut is cleared because it no longer describes the boundary. */
export function resizeNarrativeTimelineClip(
  document: EditorDocumentV2,
  clipId: string,
  edge: VisualTimelineResizeEdge,
  atSec: number,
): AgentTimelineOutcome {
  if (!Number.isFinite(atSec)) return fail('narrative clip resize time must be finite');
  const found = locatedClip(document, clipId);
  if (!found || found.clip.kind !== 'narrative' || found.track.id !== document.semantics.primaryNarrativeTrackId) {
    return fail(`primary narrative clip not found: ${clipId}`);
  }
  if (found.track.locked) return fail(`track is locked: ${found.track.id}`);
  const asset = document.assets[found.clip.assetId];
  if (!asset || asset.kind !== 'video') return fail(`narrative video asset not found: ${found.clip.assetId}`);

  const fps = document.canvas.fps;
  const minFrames = positiveDurationFrames(0.2, fps);
  const oldStartFrame = found.clip.startFrame;
  const oldEndFrame = oldStartFrame + found.clip.durationFrames;
  const siblings = found.track.clips
    .filter((clip): clip is NarrativeTimelineClip => clip.id !== clipId && clip.kind === 'narrative')
    .sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));
  const previousEndFrame = siblings
    .filter((clip) => clip.startFrame + clip.durationFrames <= oldStartFrame)
    .reduce((end, clip) => Math.max(end, clip.startFrame + clip.durationFrames), 0);
  // A packed clip at timeline zero still has a usable source head. Its left-handle pointer can be
  // negative even though the committed timeline remains non-negative, so preserve that signed delta.
  const requestedFrame = edge === 'left' ? Math.round(atSec * fps) : secondsToTimelineFrames(Math.max(0, atSec), fps);
  const sourceRate = (found.clip.sourceOutSec - found.clip.sourceInSec)
    / timelineFramesToSeconds(found.clip.durationFrames, fps);

  let newStartFrame = oldStartFrame;
  let newEndFrame = oldEndFrame;
  let sourceInSec = found.clip.sourceInSec;
  let sourceOutSec = found.clip.sourceOutSec;
  let rippleHeadExtension = false;
  if (edge === 'left') {
    const sourceFloorFrame = sourceRate > 0
      ? oldStartFrame - secondsToTimelineFrames(sourceInSec / sourceRate, fps)
      : oldStartFrame;
    rippleHeadExtension = requestedFrame < oldStartFrame && previousEndFrame === oldStartFrame;
    if (rippleHeadExtension) {
      const requestedSourceEdgeFrame = Math.max(sourceFloorFrame, requestedFrame);
      newEndFrame = oldEndFrame + oldStartFrame - requestedSourceEdgeFrame;
      if (sourceRate > 0) {
        sourceInSec = Math.max(0, sourceInSec + frameDeltaSec(requestedSourceEdgeFrame - oldStartFrame, fps) * sourceRate);
      }
    } else {
      newStartFrame = Math.max(previousEndFrame, sourceFloorFrame, Math.min(requestedFrame, oldEndFrame - minFrames));
      if (sourceRate > 0) {
        sourceInSec = Math.max(0, sourceInSec + frameDeltaSec(newStartFrame - oldStartFrame, fps) * sourceRate);
      }
    }
  } else {
    const sourceCeilingFrame = sourceRate > 0 && asset.metadata.durationSec != null
      ? oldEndFrame + secondsToTimelineFrames(Math.max(0, asset.metadata.durationSec - sourceOutSec) / sourceRate, fps)
      : Number.POSITIVE_INFINITY;
    newEndFrame = Math.min(sourceCeilingFrame, Math.max(requestedFrame, oldStartFrame + minFrames));
    if (sourceRate > 0) {
      sourceOutSec += frameDeltaSec(newEndFrame - oldEndFrame, fps) * sourceRate;
      if (asset.metadata.durationSec != null) sourceOutSec = Math.min(asset.metadata.durationSec, sourceOutSec);
    }
  }
  const newDurationFrames = newEndFrame - newStartFrame;
  if (newStartFrame === oldStartFrame && newDurationFrames === found.clip.durationFrames) {
    return mutation(document, 'Narrative clip duration unchanged', [], {
      clipId, startSec: timelineFramesToSeconds(oldStartFrame, fps), endSec: timelineFramesToSeconds(oldEndFrame, fps),
    });
  }

  let baseDocument = document;
  const receipts: EditorCommandReceipt[] = [];
  if (edge === 'right' || rippleHeadExtension) {
    const retimed = rippleHeadExtension
      ? retimeEditorClip(document, {
          trackId: found.track.id,
          clipId,
          durationFrames: newDurationFrames,
          ripple: true,
          rippleFromFrame: oldStartFrame,
        })
      : applyEditorCommand(document, {
          type: 'clip.retime',
          trackId: found.track.id,
          clipId,
          durationFrames: newDurationFrames,
          ripple: true,
        });
    if (!retimed.ok) return fail(retimed.error.message, retimed.error);
    baseDocument = retimed.document;
    receipts.push(retimed.receipt);
  }
  const baseFound = locatedClip(baseDocument, clipId);
  if (!baseFound || baseFound.clip.kind !== 'narrative') return fail(`primary narrative clip not found after resize: ${clipId}`);
  const resized: NarrativeTimelineClip = {
    ...baseFound.clip,
    startFrame: newStartFrame,
    durationFrames: newDurationFrames,
    sourceInSec,
    sourceOutSec,
    ...(edge === 'left'
      ? { properties: (() => {
          const { transIn: _removed, ...properties } = found.clip.properties;
          return properties;
        })() }
      : {}),
  };
  const tracks = baseDocument.timeline.tracks.map((track) => track.id === found.track.id
    ? {
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id === clipId) return resized;
          if (edge !== 'right' || clip.kind !== 'narrative' || clip.properties.transIn?.prevId !== clipId) return clip;
          const { transIn: _removed, ...properties } = clip.properties;
          return { ...clip, properties };
        }).sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id)),
      }
    : track);
  const next = { ...baseDocument, timeline: { ...baseDocument.timeline, tracks } };
  return mutation(next, `Resized narrative clip to ${timelineFramesToSeconds(newDurationFrames, fps)}s`, receipts, {
    clipId,
    startSec: timelineFramesToSeconds(newStartFrame, fps),
    endSec: timelineFramesToSeconds(newEndFrame, fps),
    durationSec: timelineFramesToSeconds(newDurationFrames, fps),
    sourceInSec,
    sourceOutSec,
  });
}

/** Slip one primary narrative clip: shift WHICH source range plays while the clip's timeline
 * position and duration stay untouched. `sourceDeltaSec` is in SOURCE seconds (positive = later
 * material), clamped to the asset's head (0) and tail (metadata duration when known). The span
 * sourceOutSec−sourceInSec is preserved EXACTLY — there is no speed field, so any span drift
 * would silently retime the clip. Cut boundaries are unchanged, so transitions stay. */
export function slipNarrativeTimelineClip(
  document: EditorDocumentV2,
  clipId: string,
  sourceDeltaSec: number,
): AgentTimelineOutcome {
  if (!Number.isFinite(sourceDeltaSec)) return fail('slip delta must be finite');
  const found = locatedClip(document, clipId);
  if (!found || found.clip.kind !== 'narrative' || found.track.id !== document.semantics.primaryNarrativeTrackId) {
    return fail(`primary narrative clip not found: ${clipId}`);
  }
  if (found.track.locked) return fail(`track is locked: ${found.track.id}`);
  const asset = document.assets[found.clip.assetId];
  if (!asset || asset.kind !== 'video') return fail(`narrative video asset not found: ${found.clip.assetId}`);

  const span = found.clip.sourceOutSec - found.clip.sourceInSec;
  let delta = Math.max(-found.clip.sourceInSec, sourceDeltaSec);
  if (asset.metadata.durationSec != null) {
    delta = Math.min(delta, Math.max(0, asset.metadata.durationSec - found.clip.sourceOutSec));
  }
  const sourceInSec = Math.max(0, found.clip.sourceInSec + delta);
  const sourceOutSec = sourceInSec + span;
  if (Math.abs(sourceInSec - found.clip.sourceInSec) < 1e-6) {
    return mutation(document, 'Clip source window unchanged', [], {
      clipId, sourceInSec: found.clip.sourceInSec, sourceOutSec: found.clip.sourceOutSec,
    });
  }
  const tracks = document.timeline.tracks.map((track) => track.id === found.track.id
    ? {
        ...track,
        clips: track.clips.map((clip) => (clip.id === clipId
          ? { ...clip, sourceInSec, sourceOutSec }
          : clip)),
      }
    : track);
  const next = { ...document, timeline: { ...document.timeline, tracks } };
  return mutation(next, `Slipped clip source window to ${Math.round(sourceInSec * 10) / 10}s`, [], {
    clipId,
    sourceInSec,
    sourceOutSec,
  });
}

/** Bounded edit distance for id-typo detection; bails out once the distance exceeds `cap`. */
function boundedEditDistance(left: string, right: string, cap: number): number {
  if (Math.abs(left.length - right.length) > cap) return cap + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (current[j]! < rowMin) rowMin = current[j]!;
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }
  return previous[right.length]!;
}

/** A model retyping an id from memory usually lands within a few edits of the real one (an extra
 * character, one swapped uuid group). Naming the nearest registered id turns a dead-end retry
 * loop into a one-shot correction. */
function closestAssetId(assets: EditorDocumentV2['assets'], requested: string): string | null {
  const needle = requested.replace(/^local:/, '');
  let best: string | null = null;
  let bestDistance = 7;
  for (const id of Object.keys(assets)) {
    const distance = boundedEditDistance(needle, id, 6);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  if (best) return best;
  // A dropped uuid segment puts the retype far beyond any edit-distance cap, yet the intact
  // prefix — at least the full first uuid group — still names the asset when it is unique.
  let bestPrefix: string | null = null;
  let bestLength = 0;
  let ambiguous = false;
  for (const id of Object.keys(assets)) {
    let length = 0;
    while (length < needle.length && length < id.length && needle[length] === id[length]) length += 1;
    if (length > bestLength) {
      bestPrefix = id;
      bestLength = length;
      ambiguous = false;
    } else if (length === bestLength && bestPrefix && id !== bestPrefix) {
      ambiguous = true;
    }
  }
  return !ambiguous && bestLength >= 'local_'.length + 8 ? bestPrefix : null;
}

function placeClips(document: EditorDocumentV2, input: Input, mode: 'overwrite' | 'ripple'): AgentTimelineOutcome {
  document = normalizePeerNarrativeSources(document);
  const items = Array.isArray(input.clips) ? input.clips : [];
  if (!items.length) return fail('clips is required');
  const hadVideoPlacement = document.timeline.tracks.some((track) => track.clips.some((clip) => {
    if (clip.kind !== 'narrative' && clip.kind !== 'media') return false;
    return document.assets[clip.assetId]?.kind === 'video';
  }));
  const used = new Set(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const created: string[] = [];
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const assetId = string(item.assetId);
    const asset = assetId ? next.assets[assetId] : undefined;
    if (!asset) {
      const suggestion = assetId ? closestAssetId(next.assets, assetId) : null;
      return fail(`clips[${index}] asset not found: ${assetId ?? ''}.${suggestion ? ` Closest registered id: ${suggestion}.` : ''} Copy ids exactly from receipts; never retype them.`);
    }
    const placement = placementFor(next, asset, item, used);
    if ('ok' in placement) return placement;
    // No explicit start = append after the destination lane's current content (including clips
    // placed earlier in this batch). Defaulting to 0 made every unanchored clip overwrite its
    // predecessors at the head of the track, shredding a batched montage into fragments.
    const hasExplicitStart = item.startSec != null || input.atSec != null;
    let atFrame: number;
    if (hasExplicitStart) {
      atFrame = secondsToTimelineFrames(Math.max(0, sec(item.startSec, sec(input.atSec))), next.canvas.fps);
    } else {
      const requestedTrack = string(item.trackId)
        ? next.timeline.tracks.find((track) => track.id === string(item.trackId))
        : undefined;
      const desired = expectedTrack(asset, string(item.role));
      const laneTracks = requestedTrack
        ? [requestedTrack]
        : next.timeline.tracks.filter((track) => track.type === desired.type && track.role === desired.role);
      atFrame = laneTracks
        .flatMap((track) => track.clips.map((clip) => clip.startFrame + clip.durationFrames))
        .reduce((latest, end) => Math.max(latest, end), 0);
    }
    const ensured = ensureTrack(
      next,
      asset,
      item,
      mode === 'overwrite'
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
    receipts.push(inserted.receipt);
    created.push(placement.id);
  }
  if (!hadVideoPlacement && !document.canvas.configured) {
    const sourceCanvas = canvasSizeFollowingFirstVideo(next);
    if (sourceCanvas) {
      next = {
        ...next,
        canvas: {
          ...next.canvas,
          ...sourceCanvas,
          configured: true,
        },
      };
    }
  }
  const audibleNarration = next.timeline.tracks.flatMap((track) => (
    track.role !== 'narration' || track.muted
      ? []
      : track.clips.flatMap((clip) => (
          clip.kind === 'audio' && clip.enabled && !clip.properties.muted
            ? [{ trackId: track.id, clip }]
            : []
        ))
  ));
  for (let index = 0; index < audibleNarration.length; index += 1) {
    const left = audibleNarration[index]!;
    const leftEnd = left.clip.startFrame + left.clip.durationFrames;
    const conflict = audibleNarration.slice(index + 1).find((right) => (
      right.trackId !== left.trackId
      && right.clip.startFrame < leftEnd
      && right.clip.startFrame + right.clip.durationFrames > left.clip.startFrame
    ));
    if (conflict) {
      return fail(
        'Narration clips cannot overlap in one output. Replace or remove the current narration. If the user requested another finished version, create and switch to its independent output before placing that output\'s narration.',
        { clipIds: [left.clip.id, conflict.clip.id], trackIds: [left.trackId, conflict.trackId] },
      );
    }
  }
  const hasNarration = next.timeline.tracks.some((track) => track.role === 'narration' && track.clips.some((clip) => clip.kind === 'audio' && clip.enabled));
  if (hasNarration) {
    const musicUpdates = next.timeline.tracks
      .filter((track) => track.role === 'music')
      .flatMap((track) => track.clips.flatMap((clip) => clip.kind === 'audio' && (clip.properties.volumeDb ?? 0) > -24
        ? [{ clipId: clip.id, patch: { volumeDb: -24 } }]
        : []));
    if (musicUpdates.length) {
      const mixed = applyAudioDocumentEdits({ document: next, updates: musicUpdates });
      if (!mixed.ok) return fail(mixed.error.message, mixed.error);
      next = mixed.document;
      receipts.push(...mixed.receipts);
    }
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
  // Ids that no longer exist are skipped, not fatal: an agent correcting its own work often
  // re-lists a clip it already removed, and failing the whole batch on that stale id left the
  // rest in place (and the agent retrying the identical call). The receipt names the misses.
  const missingClipIds: string[] = [];
  for (const id of clipIds) {
    const found = locatedClip(next, id);
    if (!found) {
      missingClipIds.push(id);
      continue;
    }
    byTrack.set(found.track.id, [...(byTrack.get(found.track.id) ?? []), id]);
  }
  if (!byTrack.size) return fail(`clip not found: ${missingClipIds.join(', ')}`);
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
  // remove means remove — no editorial-judgment guard here. Protecting an assembled cut from
  // agent self-demolition is the per-turn harness lock's job (it knows intent and turn state);
  // an engine-level veto also blocked legitimate clears from the UI, MCP agents and other flows,
  // and removals stay recoverable through undo.
  const removedCount = clipIds.length - missingClipIds.length;
  const summary = `Removed ${removedCount} clip${removedCount === 1 ? '' : 's'}`
    + (missingClipIds.length ? ` (${missingClipIds.length} already gone: ${missingClipIds.join(', ')})` : '');
  return mutation(next, summary, receipts, missingClipIds.length ? { removedClipIds: clipIds.filter((id) => !missingClipIds.includes(id)), missingClipIds } : undefined);
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
  const unchangedPrimaryFillClipIds: string[] = [];
  let visualSourceChanged = false;
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
    const visualAsset = (found.clip.kind === 'media' || found.clip.kind === 'narrative')
      ? next.assets[found.clip.assetId]
      : undefined;
    const patchesVisualSource = typeof item.sourceInSec === 'number' || typeof item.sourceOutSec === 'number';
    if (patchesVisualSource && visualAsset?.kind === 'video' && (found.clip.kind === 'media' || found.clip.kind === 'narrative')) {
      const sourceInSec = typeof item.sourceInSec === 'number' ? item.sourceInSec : found.clip.sourceInSec;
      const sourceOutSec = typeof item.sourceOutSec === 'number' ? item.sourceOutSec : found.clip.sourceOutSec;
      if (!Number.isFinite(sourceInSec) || !Number.isFinite(sourceOutSec) || sourceInSec < 0 || sourceOutSec <= sourceInSec || (visualAsset.metadata.durationSec != null && sourceOutSec > visualAsset.metadata.durationSec + 0.001)) {
        return fail(`items[${index}] video source range must be positive, ordered, and inside the asset duration`);
      }
      const oldSourceDurationSec = found.clip.sourceOutSec - found.clip.sourceInSec;
      const oldTimelineDurationSec = timelineFramesToSeconds(found.clip.durationFrames, next.canvas.fps);
      const playbackSpeed = oldTimelineDurationSec > 0 ? oldSourceDurationSec / oldTimelineDurationSec : 1;
      const newDurationFrames = positiveDurationFrames((sourceOutSec - sourceInSec) / Math.max(0.01, playbackSpeed), next.canvas.fps);
      if (newDurationFrames !== found.clip.durationFrames) {
        const retimed = applyEditorCommand(next, {
          type: 'clip.retime',
          trackId: found.track.id,
          clipId: found.clip.id,
          durationFrames: newDurationFrames,
          ripple: found.clip.kind === 'narrative',
        });
        if (!retimed.ok) return fail(retimed.error.message, retimed.error);
        next = retimed.document;
        receipts.push(retimed.receipt);
        found = locatedClip(next, clipId!);
        if (!found) return fail(`items[${index}] clip not found after source-range retime`);
      }
      visualSourceChanged = true;
    } else if (patchesVisualSource && found.clip.kind !== 'audio') {
      return fail(`items[${index}] sourceInSec/sourceOutSec require a video or audio clip`);
    }
    if (typeof item.speed === 'number' && visualAsset?.kind === 'video') {
      return fail(`items[${index}] use set_video_speed for video speed changes`);
    }
    const commonPatch: ClipPatch = {
      ...(typeof item.enabled === 'boolean' ? { enabled: item.enabled } : {}),
      ...(patchesVisualSource && visualAsset?.kind === 'video' && typeof item.sourceInSec === 'number' ? { sourceInSec: item.sourceInSec } : {}),
      ...(patchesVisualSource && visualAsset?.kind === 'video' && typeof item.sourceOutSec === 'number' ? { sourceOutSec: item.sourceOutSec } : {}),
    };
    if (item.fit === 'contain' || item.fit === 'cover') {
      if (found.clip.kind === 'narrative') {
        if (item.fit === 'contain') {
          return fail(`items[${index}] fit=contain is not supported for primary narrative clips; use box for canvas placement or set_shot_framing for source crop`);
        }
        // Primary narrative video is cover-filled by definition. Treat an explicit cover request as
        // confirmation, not as an invalid media-only patch that aborts the whole batch.
        unchangedPrimaryFillClipIds.push(found.clip.id);
      } else {
        commonPatch.fit = item.fit;
      }
    }
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
  if (visualSourceChanged && next.semantics.managedCaptionTrackId) {
    const relayed = applyEditorCommand(next, { type: 'captions.relay' });
    if (!relayed.ok) return fail(relayed.error.message, relayed.error);
    next = relayed.document;
    receipts.push(relayed.receipt);
  }
  const changedCount = receipts.filter((receipt) => receipt.affectedTrackIds.length > 0).length;
  const summary = changedCount === 0 && unchangedPrimaryFillClipIds.length
    ? `Primary video already fills the canvas for ${unchangedPrimaryFillClipIds.length} clip${unchangedPrimaryFillClipIds.length === 1 ? '' : 's'}`
    : `Updated ${items.length} clip${items.length === 1 ? '' : 's'}`;
  return mutation(next, summary, receipts, unchangedPrimaryFillClipIds.length ? { unchangedPrimaryFillClipIds } : undefined);
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
    for (const clip of document.timeline.tracks
      .find((track) => track.id === document.semantics.primaryNarrativeTrackId)
      ?.clips ?? []) {
      if (clip.kind === 'narrative' && document.semantics.transcripts[clip.assetId]?.length) ids.add(clip.assetId);
    }
    if (!ids.size) for (const [id, segments] of Object.entries(document.semantics.transcripts)) if (segments.length) ids.add(id);
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

/** Deterministic overlay-text layout guard. Two collisions kept recurring in delivered edits:
 * a title placed into the caption band (both stacked at the bottom), and two titles visible at
 * the same time on intersecting boxes. Both are geometry facts the engine can resolve — captions
 * own their bottom band whenever they are on, and a later title is lifted above a concurrent
 * peer. Model-authored placement stays authoritative everywhere these rules are not violated. */
const OVERLAY_TEXT_SAFE_TOP = 0.06;
const CAPTION_BAND_HEIGHT_FRAC = 0.14;
const OVERLAY_TEXT_GAP = 0.02;
function overlayTextLayoutGuard(
  document: EditorDocumentV2,
  requested: { x: number; y: number; w: number; h: number },
  startSec: number,
  durationSec: number,
): { x: number; y: number; w: number; h: number } {
  const box = { ...requested };
  const caption = document.appearance.captionStyle;
  if (caption?.on) {
    // captionStyle.yPct = caption bottom edge from canvas top (%); reserve up to two lines above.
    const captionBottom = Math.min(1, Math.max(0, (caption.yPct ?? 88) / 100));
    const bandTop = captionBottom - CAPTION_BAND_HEIGHT_FRAC;
    if (box.y + box.h > bandTop - OVERLAY_TEXT_GAP && box.y < captionBottom + OVERLAY_TEXT_GAP) {
      box.y = Math.max(OVERLAY_TEXT_SAFE_TOP, bandTop - OVERLAY_TEXT_GAP - box.h);
    }
  }
  const windowEnd = startSec + durationSec;
  const peers = document.timeline.tracks.flatMap((track) => track.clips.flatMap((clip) => {
    if (clip.kind !== 'graphic' || clip.block.templateId !== 'title' || !clip.block.box) return [];
    const clipStart = timelineFramesToSeconds(clip.startFrame, document.canvas.fps);
    const clipEnd = clipStart + timelineFramesToSeconds(clip.durationFrames, document.canvas.fps);
    return clipEnd > startSec && clipStart < windowEnd ? [clip.block.box] : [];
  }));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const hit = peers.find((peer) => (
      box.x < peer.x + peer.w && box.x + box.w > peer.x
      && box.y < peer.y + peer.h && box.y + box.h > peer.y
    ));
    if (!hit) break;
    const lifted = Math.max(OVERLAY_TEXT_SAFE_TOP, hit.y - OVERLAY_TEXT_GAP - box.h);
    if (lifted === box.y) break; // crowded against the top: keep the residual rather than thrash
    box.y = lifted;
  }
  return box;
}

function addTexts(document: EditorDocumentV2, input: Input): AgentTimelineOutcome {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return fail('items is required');
  let next = document;
  const receipts: EditorCommandReceipt[] = [];
  const clipIds: string[] = [];
  const skippedDuplicates: string[] = [];
  const used = new Set(next.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  for (const [index, raw] of items.entries()) {
    const item = (raw ?? {}) as Input;
    const text = string(item.text);
    if (!text) return fail(`items[${index}] text is required`);
    const preset = isDisplayTextPresetId(item.preset) ? item.preset : 'clean';
    const animation = isDisplayTextAnimationId(item.animation) ? item.animation : undefined;
    const fontFamily = isDisplayTextFontId(item.fontFamily) ? item.fontFamily : undefined;
    const align = item.align === 'left' || item.align === 'right' || item.align === 'center' ? item.align : undefined;
    const placement = placementPercentToBox(item.placement, next.canvas.width, next.canvas.height);
    if (placement.error) return fail(`items[${index}] ${placement.error}`);
    const startSec = Math.max(0, sec(item.startSec));
    const durationSec = Math.max(0.2, sec(item.durationSec, 3));
    // Duplicate protection: a second styling pass once re-ADDED an existing line instead of
    // updating it, stacking two copies of the same words on screen. Identical text overlapping
    // the same time window is an update target, never a second copy.
    const itemEndSec = startSec + durationSec;
    const duplicate = next.timeline.tracks.some((track) => track.clips.some((clip) => {
      if (clip.kind !== 'graphic' || clip.block.templateId !== 'title') return false;
      const clipStart = timelineFramesToSeconds(clip.startFrame, next.canvas.fps);
      const clipEnd = clipStart + timelineFramesToSeconds(clip.durationFrames, next.canvas.fps);
      const clipText = typeof clip.block.slots?.text === 'string' ? clip.block.slots.text.trim() : '';
      return clipText === text && clipEnd > startSec && clipStart < itemEndSec;
    }));
    if (duplicate) {
      skippedDuplicates.push(text.slice(0, 24));
      continue;
    }
    const block = titleBlock({
      text,
      startSec,
      durationSec,
      trackIndex: typeof item.trackIndex === 'number'
        ? Math.round(item.trackIndex)
        : freeGraphicsStackOrder(next, startSec, durationSec),
      preset,
      ...(animation ? { animation } : {}),
      ...(string(item.color) ? { color: string(item.color) } : {}),
      ...(string(item.accentColor) ? { accentColor: string(item.accentColor) } : {}),
      ...(typeof item.fontSize === 'number' ? { fontSize: item.fontSize } : {}),
      ...(typeof item.fontWeight === 'number' ? { fontWeight: item.fontWeight } : {}),
      ...(fontFamily ? { fontFamily } : {}),
      ...(align ? { align } : {}),
    });
    // Agent-created native text must remain positionable. Manual/legacy titleBlock callers retain
    // their established full-canvas behaviour; this tool supplies the editable safe-area geometry.
    block.box = overlayTextLayoutGuard(
      next,
      placement.box ?? { x: 0.1, y: 0.34, w: 0.8, h: 0.32 },
      startSec,
      durationSec,
    );
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
  return mutation(
    next,
    `Added ${clipIds.length} text clip${clipIds.length === 1 ? '' : 's'}${skippedDuplicates.length ? `; skipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? '' : 's'}` : ''}`,
    receipts,
    {
      clipIds,
      ...(skippedDuplicates.length ? {
        skippedDuplicates,
        instruction: 'Identical on-screen text already exists in that time window. Use update_texts to restyle or move the existing clip instead of adding a copy.',
      } : {}),
    },
  );
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
    const preset = isDisplayTextPresetId(item.preset) ? item.preset : undefined;
    const animation = isDisplayTextAnimationId(item.animation) ? item.animation : undefined;
    const fontFamily = isDisplayTextFontId(item.fontFamily) ? item.fontFamily : undefined;
    const align = item.align === 'left' || item.align === 'right' || item.align === 'center' ? item.align : undefined;
    const color = typeof item.color === 'string' ? item.color.trim() : undefined;
    const accentColor = typeof item.accentColor === 'string' ? item.accentColor.trim() : undefined;
    const fontSize = typeof item.fontSize === 'number' ? item.fontSize : undefined;
    const fontWeight = typeof item.fontWeight === 'number' ? item.fontWeight : undefined;
    const visualChanged = preset !== undefined || animation !== undefined || align !== undefined
      || color !== undefined || accentColor !== undefined || fontSize !== undefined
      || fontWeight !== undefined || fontFamily !== undefined;
    const placement = placementPercentToBox(item.placement, document.canvas.width, document.canvas.height);
    if (placement.error) return fail(`items[${index}] ${placement.error}`);
    updates.push({
      clipId: found.clip.id,
      ...(typeof item.startSec === 'number' ? { startSec: Math.max(0, item.startSec) } : {}),
      ...(typeof item.durationSec === 'number' ? { durationSec: Math.max(0.2, item.durationSec) } : {}),
      ...((text !== undefined || visualChanged || placement.box) ? { block: {
        slots: {
          ...found.clip.block.slots,
          ...(text !== undefined ? { text } : {}),
          ...(preset !== undefined ? { preset } : {}),
          ...(animation !== undefined ? { animation } : {}),
          ...(align !== undefined ? { align } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(accentColor !== undefined ? { accentColor } : {}),
          ...(fontSize !== undefined ? { fontSize } : {}),
          ...(fontWeight !== undefined ? { fontWeight } : {}),
          ...(fontFamily !== undefined ? { fontFamily } : {}),
        },
        ...(text !== undefined ? { label: text } : {}),
        ...(placement.box ? { box: placement.box } : {}),
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
