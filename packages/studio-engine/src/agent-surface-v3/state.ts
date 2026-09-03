/**
 * Agent surface v3 — state shape and mutation deltas, computed from EditorDocumentV2.
 *
 * `renderV3State` is what get_state returns: tracks with roles, clips as `frames:[start,end)` with
 * source seconds and non-default properties only, linked audio folded into its visual clip, the
 * managed caption track as one object. `documentDelta` diffs two documents into the receipt contract:
 * touched/created clips (capped), uniform shifts compressed to rules, removed ids, created tracks,
 * caption changes, and notes telling the agent exactly when to re-read. Pure; no I/O.
 */

import type {
  EditorDocumentV2,
  EditorTrack,
  TimelineClip,
} from '../editor-document/types';

export const V3_DELTA_CLIP_LIMIT = 30;
export const V3_SHIFT_RULE_MIN = 3;

export interface V3ClipView {
  id: string;
  kind: 'narrative' | 'media' | 'graphic' | 'audio' | 'caption';
  trackId: string;
  frames: [number, number];
  assetId?: string;
  source?: [number, number];
  box?: { x: number; y: number; w: number; h: number };
  anchor?: unknown;
  audio?: { clipId: string; volumeDb?: number; mute?: boolean };
  linkGroupId?: string;
  enabled?: false;
  component?: { componentId?: string; box?: unknown };
  [property: string]: unknown;
}

export interface V3TrackView {
  id: string;
  type: EditorTrack['type'];
  role?: EditorTrack['role'];
  name?: string;
  order: number;
  muted?: true;
  hidden?: true;
  locked?: true;
  syncLocked?: false;
  gaps?: Array<[number, number]>;
  clips?: V3ClipView[];
  captions?: V3CaptionsView;
  linkedClips?: number;
  totalClips?: number;
}

export interface V3CaptionsView {
  on: boolean;
  cueCount: number;
  source?: unknown;
  preview?: string;
}

export interface V3StateView {
  canvas: { width: number; height: number; fps: number };
  durationFrames: number;
  frame?: { id: string };
  tracks: V3TrackView[];
  /** `library: true` marks project-library media not yet placed on any track — the footage to start from. */
  assets: Array<{ id: string; kind: string; label?: string; durationSec?: number; hasAudio?: boolean; library?: true }>;
  semantics: { primaryTrackId: string; sceneIds: string[] };
}

export interface V3Delta {
  clips?: V3ClipView[];
  shifted?: Array<{ trackId: string; fromFrame: number; byFrames: number; count: number }>;
  removedClipIds?: string[];
  /** Source spans that left the timeline (removed or trimmed clips). Re-insert one forward with
   *  insert_clips/add_clips + source instead of undoing. */
  removedSource?: Array<{ clipId: string; assetId: string; source: [number, number]; fromFrame: number }>;
  createdTracks?: Array<{ id: string; type: string; role?: string; order: number }>;
  removedTrackIds?: string[];
  captions?: { cueCount: number; change: 'relaid' | 'shifted' | 'removed' | 'restyled' };
  durationFrames?: [number, number];
  canvas?: { from: [number, number]; to: [number, number] };
  notes?: string[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

function stripDefaults(value: Record<string, unknown> | undefined, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!value) return out;
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;
    if (key in defaults && JSON.stringify(defaults[key]) === JSON.stringify(raw)) continue;
    out[key] = raw;
  }
  return out;
}

const NARRATIVE_DEFAULTS: Record<string, unknown> = { treatment: 'full', speed: 1, volumeDb: 0, audioMuted: false, treatSize: 50, treatCrop: 50 };

const isZero = (value: unknown) => value === undefined || value === 0;
/** Identity layer geometry (no crop, no rounding, unit transform) is the default and stays out of receipts. */
function isIdentityFraming(framing: unknown): boolean {
  const f = framing as { crop?: Record<string, unknown>; rounding?: unknown; transform?: Record<string, unknown> } | undefined;
  if (!f) return true;
  const crop = f.crop ?? {};
  const transform = f.transform ?? {};
  return isZero(f.rounding)
    && ['top', 'left', 'right', 'bottom'].every((side) => isZero(crop[side]))
    && (transform.scale === undefined || transform.scale === 1) && isZero(transform.offsetX) && isZero(transform.offsetY);
}
/** Subject framing at unit scale centred on the source is the default. */
function isIdentityPreciseFraming(value: unknown): boolean {
  const p = value as { scale?: unknown; anchorX?: unknown; anchorY?: unknown } | undefined;
  if (!p) return true;
  return (p.scale === undefined || p.scale === 1) && (p.anchorX === undefined || p.anchorX === 0.5) && (p.anchorY === undefined || p.anchorY === 0.5);
}
function stripIdentityGeometry(view: V3ClipView, mediaFraming: unknown): void {
  if (mediaFraming && !isIdentityFraming(mediaFraming)) view.framing = mediaFraming;
  const props = view as unknown as Record<string, unknown>;
  if ('preciseFraming' in props && isIdentityPreciseFraming(props.preciseFraming)) delete props.preciseFraming;
}
const AUDIO_DEFAULTS: Record<string, unknown> = { speed: 1, muted: false, fadeInSec: 0, fadeOutSec: 0 };

function isManagedCaptionTrack(document: EditorDocumentV2, track: EditorTrack): boolean {
  return track.id === document.semantics.managedCaptionTrackId || track.role === 'managedCaptions';
}

/** Render one clip in the v3 shape. Linked audio partners are folded by the caller. */
export function renderV3Clip(clip: TimelineClip, trackId: string): V3ClipView {
  const view: V3ClipView = { id: clip.id, kind: clip.kind, trackId, frames: [clip.startFrame, clip.startFrame + clip.durationFrames] };
  if (!clip.enabled) view.enabled = false;
  if (clip.linkGroupId) view.linkGroupId = clip.linkGroupId;
  switch (clip.kind) {
    case 'narrative': {
      view.assetId = clip.assetId;
      view.source = [round3(clip.sourceInSec), round3(clip.sourceOutSec)];
      if (clip.box) view.box = clip.box;
      const { transIn: _transIn, ...rest } = (clip.properties ?? {}) as Record<string, unknown>;
      Object.assign(view, stripDefaults(rest, NARRATIVE_DEFAULTS));
      stripIdentityGeometry(view, clip.mediaFraming);
      break;
    }
    case 'media': {
      view.assetId = clip.assetId;
      view.source = [round3(clip.sourceInSec), round3(clip.sourceOutSec)];
      if (clip.box) view.box = clip.box;
      if (clip.fit && clip.fit !== 'cover') view.fit = clip.fit;
      if (clip.opacity !== undefined && clip.opacity !== 1) view.opacity = clip.opacity;
      if (clip.anchorX !== undefined && clip.anchorX !== 0.5) view.anchorX = clip.anchorX;
      if (clip.anchorY !== undefined && clip.anchorY !== 0.5) view.anchorY = clip.anchorY;
      if (clip.video) Object.assign(view, stripDefaults(clip.video as Record<string, unknown>, NARRATIVE_DEFAULTS));
      stripIdentityGeometry(view, clip.mediaFraming);
      if (clip.keyframes && (clip.keyframes.box?.length || clip.keyframes.opacity?.length)) view.keyframes = clip.keyframes;
      break;
    }
    case 'graphic': {
      if (clip.assetId) view.assetId = clip.assetId;
      view.anchor = clip.anchor;
      const block = clip.block as unknown as { templateId?: string; box?: unknown; slots?: unknown };
      view.component = { ...(block.templateId ? { componentId: block.templateId } : {}), ...(block.box ? { box: block.box } : {}) };
      break;
    }
    case 'caption': {
      view.anchor = clip.anchor;
      if (clip.managed) view.managed = true;
      break;
    }
    case 'audio': {
      view.assetId = clip.assetId;
      if (clip.sourceOutSec !== undefined) view.source = [round3(clip.sourceInSec), round3(clip.sourceOutSec)];
      else if (clip.sourceInSec) view.sourceInSec = round3(clip.sourceInSec);
      view.anchor = clip.anchor;
      Object.assign(view, stripDefaults((clip.properties ?? {}) as Record<string, unknown>, AUDIO_DEFAULTS));
      break;
    }
  }
  return view;
}

function gapsOf(track: EditorTrack): Array<[number, number]> {
  const sorted = [...track.clips].filter((clip) => clip.enabled !== false).sort((left, right) => left.startFrame - right.startFrame);
  const gaps: Array<[number, number]> = [];
  let cursor = 0;
  for (const clip of sorted) {
    if (clip.startFrame > cursor) gaps.push([cursor, clip.startFrame]);
    cursor = Math.max(cursor, clip.startFrame + clip.durationFrames);
  }
  return gaps;
}

function captionsView(document: EditorDocumentV2, track: EditorTrack): V3CaptionsView {
  const cues = track.clips.filter((clip) => clip.kind === 'caption');
  const preview = cues
    .slice(0, 3)
    .map((clip) => {
      const slots = (clip as { block?: { slots?: Record<string, unknown> } }).block?.slots;
      const text = slots && typeof slots === 'object' ? Object.values(slots).find((value) => typeof value === 'string') : undefined;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join(' … ');
  return {
    on: cues.length > 0,
    cueCount: cues.length,
    ...(document.semantics.managedCaptionSource ? { source: document.semantics.managedCaptionSource } : {}),
    ...(preview ? { preview: preview.slice(0, 120) } : {}),
  };
}

export function documentDurationFrames(document: EditorDocumentV2): number {
  let end = 0;
  for (const track of document.timeline.tracks) for (const clip of track.clips) end = Math.max(end, clip.startFrame + clip.durationFrames);
  return end;
}

/** The get_state shape. `window` narrows tracks and frames; truncated tracks report totalClips. */
export function renderV3State(
  document: EditorDocumentV2,
  options: { window?: { tracks?: string[]; fromFrame?: number; toFrame?: number } } = {},
): V3StateView {
  const window = options.window;
  const wanted = window?.tracks?.length ? new Set(window.tracks) : null;
  const inWindow = (clip: TimelineClip) => {
    if (window?.fromFrame !== undefined && clip.startFrame + clip.durationFrames <= window.fromFrame) return false;
    if (window?.toFrame !== undefined && clip.startFrame >= window.toFrame) return false;
    return true;
  };
  // linked audio: an audio clip sharing a link group with exactly one visual clip folds into it
  const audioByGroup = new Map<string, TimelineClip[]>();
  for (const track of document.timeline.tracks) {
    if (track.type !== 'audio') continue;
    for (const clip of track.clips) if (clip.linkGroupId) audioByGroup.set(clip.linkGroupId, [...(audioByGroup.get(clip.linkGroupId) ?? []), clip]);
  }
  const folded = new Set<string>();
  const tracks: V3TrackView[] = [];
  for (const track of document.timeline.tracks) {
    if (wanted && !wanted.has(track.id)) continue;
    const view: V3TrackView = { id: track.id, type: track.type, order: track.stackOrder };
    if (track.role) view.role = track.role;
    if (track.name) view.name = track.name;
    if (track.muted) view.muted = true;
    if (track.hidden) view.hidden = true;
    if (track.locked) view.locked = true;
    if (!track.syncLocked) view.syncLocked = false;
    if (isManagedCaptionTrack(document, track)) {
      view.captions = captionsView(document, track);
      tracks.push(view);
      continue;
    }
    const gaps = gapsOf(track);
    if (gaps.length) view.gaps = gaps;
    const clips: V3ClipView[] = [];
    for (const clip of track.clips) {
      if (track.type === 'audio' && clip.linkGroupId) {
        const partners = audioByGroup.get(clip.linkGroupId) ?? [];
        const visual = document.timeline.tracks.flatMap((t) => t.type !== 'audio' ? t.clips : []).filter((c) => c.linkGroupId === clip.linkGroupId);
        if (partners.length === 1 && visual.length === 1) { folded.add(clip.id); continue; }
      }
      if (!inWindow(clip)) continue;
      const rendered = renderV3Clip(clip, track.id);
      if (clip.kind !== 'audio' && clip.linkGroupId) {
        const partner = (audioByGroup.get(clip.linkGroupId) ?? [])[0];
        if (partner && partner.kind === 'audio') {
          const props = (partner.properties ?? {}) as Record<string, unknown>;
          rendered.audio = {
            clipId: partner.id,
            ...(typeof props.volumeDb === 'number' && props.volumeDb !== 0 ? { volumeDb: props.volumeDb } : {}),
            ...(props.muted === true ? { mute: true } : {}),
          };
        }
      }
      clips.push(rendered);
    }
    if (track.type === 'audio') {
      const foldedHere = track.clips.filter((clip) => folded.has(clip.id)).length;
      if (foldedHere) view.linkedClips = foldedHere;
    }
    view.clips = clips;
    if (window && clips.length !== track.clips.length) view.totalClips = track.clips.length;
    tracks.push(view);
  }
  const placedAssetIds = new Set<string>();
  for (const track of document.timeline.tracks) for (const clip of track.clips) if ('assetId' in clip && clip.assetId) placedAssetIds.add(clip.assetId);
  return {
    canvas: { width: document.canvas.width, height: document.canvas.height, fps: document.canvas.fps },
    durationFrames: documentDurationFrames(document),
    ...(document.appearance.frameId ? { frame: { id: document.appearance.frameId } } : {}),
    tracks,
    assets: Object.values(document.assets).map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      ...(asset.label ? { label: asset.label } : {}),
      ...(asset.metadata.durationSec !== undefined ? { durationSec: round3(asset.metadata.durationSec) } : {}),
      ...(asset.metadata.hasAudio !== undefined ? { hasAudio: asset.metadata.hasAudio } : {}),
      ...(!placedAssetIds.has(asset.id) ? { library: true as const } : {}),
    })),
    semantics: { primaryTrackId: document.semantics.primaryNarrativeTrackId, sceneIds: document.semantics.scenes.map((scene) => scene.id) },
  };
}

/** Diff two documents into the v3 receipt delta; null when nothing observable changed. */
export function documentDelta(before: EditorDocumentV2, after: EditorDocumentV2): V3Delta | null {
  const delta: V3Delta = {};
  const notes: string[] = [];

  if (before.canvas.width !== after.canvas.width || before.canvas.height !== after.canvas.height) {
    delta.canvas = { from: [before.canvas.width, before.canvas.height], to: [after.canvas.width, after.canvas.height] };
  }
  const dur0 = documentDurationFrames(before);
  const dur1 = documentDurationFrames(after);
  if (dur0 !== dur1) delta.durationFrames = [dur0, dur1];

  const beforeTracks = new Map(before.timeline.tracks.map((track) => [track.id, track]));
  const afterTracks = new Map(after.timeline.tracks.map((track) => [track.id, track]));
  const createdTracks = after.timeline.tracks.filter((track) => !beforeTracks.has(track.id));
  if (createdTracks.length) delta.createdTracks = createdTracks.map((track) => ({ id: track.id, type: track.type, ...(track.role ? { role: track.role } : {}), order: track.stackOrder }));
  const removedTracks = before.timeline.tracks.filter((track) => !afterTracks.has(track.id));
  if (removedTracks.length) delta.removedTrackIds = removedTracks.map((track) => track.id);

  const beforeClips = new Map<string, { clip: TimelineClip; trackId: string; caption: boolean }>();
  const afterClips = new Map<string, { clip: TimelineClip; trackId: string; caption: boolean }>();
  for (const track of before.timeline.tracks) for (const clip of track.clips) beforeClips.set(clip.id, { clip, trackId: track.id, caption: isManagedCaptionTrack(before, track) });
  for (const track of after.timeline.tracks) for (const clip of track.clips) afterClips.set(clip.id, { clip, trackId: track.id, caption: isManagedCaptionTrack(after, track) });

  // captions: one aggregate, never enumerated cues
  const caps0 = [...beforeClips.values()].filter((entry) => entry.caption).map((entry) => entry.clip);
  const caps1 = [...afterClips.values()].filter((entry) => entry.caption).map((entry) => entry.clip);
  if (caps0.length && !caps1.length) delta.captions = { cueCount: 0, change: 'removed' };
  else if (caps0.length || caps1.length) {
    const sameIds = caps0.length === caps1.length && caps0.every((clip, index) => caps1[index]!.id === clip.id);
    if (!sameIds) delta.captions = { cueCount: caps1.length, change: 'relaid' };
    else if (caps0.some((clip, index) => caps1[index]!.startFrame !== clip.startFrame || caps1[index]!.durationFrames !== clip.durationFrames)) delta.captions = { cueCount: caps1.length, change: 'shifted' };
    else if (JSON.stringify(caps0.map((c) => (c as { block?: unknown }).block)) !== JSON.stringify(caps1.map((c) => (c as { block?: unknown }).block))) delta.captions = { cueCount: caps1.length, change: 'restyled' };
  }

  const touched: V3ClipView[] = [];
  const shiftGroups = new Map<string, { trackId: string; byFrames: number; fromFrame: number; count: number; ids: string[] }>();
  const removedClipIds: string[] = [];
  const removedSource: NonNullable<V3Delta['removedSource']> = [];
  const sourceOf = (clip: TimelineClip): [string, number, number] | null => {
    if (clip.kind !== 'narrative' && clip.kind !== 'media' && clip.kind !== 'audio') return null;
    const outSec = clip.sourceOutSec ?? clip.sourceInSec + clip.durationFrames / Math.max(1, before.canvas.fps);
    return [clip.assetId, round3(clip.sourceInSec), round3(outSec)];
  };
  for (const [id, entry] of beforeClips) {
    if (entry.caption) continue;
    const next = afterClips.get(id);
    if (!next) {
      removedClipIds.push(id);
      const src = sourceOf(entry.clip);
      if (src) removedSource.push({ clipId: id, assetId: src[0], source: [src[1], src[2]], fromFrame: entry.clip.startFrame });
      continue;
    }
    const { startFrame: s0, ...rest0 } = entry.clip as unknown as Record<string, unknown>;
    const { startFrame: s1, ...rest1 } = next.clip as unknown as Record<string, unknown>;
    const contentChanged = entry.trackId !== next.trackId || JSON.stringify(rest0) !== JSON.stringify(rest1);
    if (contentChanged) {
      touched.push(renderV3Clip(next.clip, next.trackId));
      const was = sourceOf(entry.clip);
      const now = sourceOf(next.clip);
      // A trimmed clip lost part of its source: report the span that left so it can be re-inserted forward.
      if (was && now && (now[1] > was[1] || now[2] < was[2])) {
        if (now[1] > was[1]) removedSource.push({ clipId: id, assetId: was[0], source: [was[1], now[1]], fromFrame: entry.clip.startFrame });
        if (now[2] < was[2]) removedSource.push({ clipId: id, assetId: was[0], source: [now[2], was[2]], fromFrame: next.clip.startFrame + next.clip.durationFrames });
      }
      continue;
    }
    const by = (s1 as number) - (s0 as number);
    if (by !== 0) {
      const key = `${next.trackId}:${by}`;
      const group = shiftGroups.get(key) ?? { trackId: next.trackId, byFrames: by, fromFrame: Number.POSITIVE_INFINITY, count: 0, ids: [] };
      group.count += 1;
      group.fromFrame = Math.min(group.fromFrame, s0 as number);
      group.ids.push(id);
      shiftGroups.set(key, group);
    }
  }
  for (const [id, entry] of afterClips) {
    if (entry.caption || beforeClips.has(id)) continue;
    touched.push(renderV3Clip(entry.clip, entry.trackId));
  }
  const shifted: V3Delta['shifted'] = [];
  for (const group of shiftGroups.values()) {
    if (group.count >= V3_SHIFT_RULE_MIN) shifted.push({ trackId: group.trackId, fromFrame: group.fromFrame, byFrames: group.byFrames, count: group.count });
    else for (const id of group.ids) { const entry = afterClips.get(id)!; touched.push(renderV3Clip(entry.clip, entry.trackId)); }
  }
  touched.sort((left, right) => left.frames[0] - right.frames[0]);
  if (touched.length) {
    delta.clips = touched.slice(0, V3_DELTA_CLIP_LIMIT);
    if (touched.length > V3_DELTA_CLIP_LIMIT) notes.push(`Showing ${V3_DELTA_CLIP_LIMIT} of ${touched.length} changed clips — re-read get_state for the rest.`);
  }
  if (shifted.length) delta.shifted = shifted.sort((left, right) => left.fromFrame - right.fromFrame);
  if (removedClipIds.length) delta.removedClipIds = removedClipIds;
  if (removedSource.length) delta.removedSource = removedSource;
  if (removedTracks.length || createdTracks.length) notes.push('Track set changed — track order values may have moved; re-read get_state only before a manage_tracks order call, not for clip edits.');
  if (delta.captions && delta.captions.change !== 'restyled') notes.push('Caption cues were re-derived; never address individual cues.');
  if (notes.length) delta.notes = notes;
  return Object.keys(delta).length ? delta : null;
}
