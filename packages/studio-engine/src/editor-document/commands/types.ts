import type {
  EditorDocumentV2,
  EditorMediaAsset,
  EditorTrack,
  EditorTrackRole,
  EditorTrackType,
  GraphicBlockPayload,
  AudioClipProperties,
  AudioTimelineClip,
  GraphicTimelineClip,
  NarrativeTimelineClip,
  NarrativeProperties,
  MediaVideoProperties,
  TimelineClip,
  TimelineClipId,
  TrackId,
} from '../types';
import type { AtomicMediaFraming, CaptionStyle, ShotFilter, ShotFramingPatch } from '../../composition-core';

export interface ShotAudioPatch {
  volumeDb?: number;
  mute?: boolean;
  fadeInSec?: number;
  fadeOutSec?: number;
}

export interface NarrativeClipPatch {
  /** Sparse semantic shot fields such as transitions, matte and treatment metadata. */
  properties?: Partial<NarrativeProperties>;
  framing?: ShotFramingPatch;
  /** Stable overlay identity occupying the framing vacancy; null deliberately clears the link. */
  partnerBlockId?: TimelineClipId | null;
  /** `null` and an all-neutral filter both remove the persisted grade. */
  filter?: ShotFilter | null;
  audio?: ShotAudioPatch;
}

export interface NarrativeClipPatchUpdate {
  clipId: TimelineClipId;
  patch: NarrativeClipPatch;
}

export interface InsertTrackInput {
  id: TrackId;
  type: EditorTrackType;
  role?: EditorTrackRole;
  name?: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
  /** New tracks follow ripple edits by default, matching ordinary NLE sync-lock behaviour. */
  syncLocked?: boolean;
  stackOrder?: number;
  clips?: TimelineClip[];
}

export type TrackPatch = Partial<Pick<EditorTrack,
  'name' | 'muted' | 'hidden' | 'locked' | 'syncLocked' | 'stackOrder'
>>;

export interface ClipPatch {
  enabled?: boolean;
  /** Source-clock trim boundaries for video narrative/media clips. Duration/ripple is coordinated by the caller. */
  sourceInSec?: number;
  sourceOutSec?: number;
  /** Visual media fill policy; valid only for media clips. */
  fit?: 'contain' | 'cover';
  /** Canvas-relative placement. x/y may be outside 0..1 and w/h may exceed 1. */
  box?: { x: number; y: number; w: number; h: number };
  /** Canonical layer-space transform/crop. null returns the clip to identity/legacy fallback. */
  mediaFraming?: AtomicMediaFraming | null;
  /** Full video-clip settings replacement. `null` clears settings back to neutral defaults. */
  video?: MediaVideoProperties | null;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  keyframes?: {
    box?: Array<{ frame: number; x: number; y: number; w: number; h: number }>;
    opacity?: Array<{ frame: number; value: number }>;
  } | null;
}

export type CanvasPatch = Pick<EditorDocumentV2['canvas'], 'width' | 'height'>;

export interface OverlayClipPatch {
  startFrame?: number;
  durationFrames?: number;
  block?: Partial<GraphicBlockPayload>;
}

export interface OverlayClipPatchUpdate {
  clipId: TimelineClipId;
  patch: OverlayClipPatch;
}

/** Fully resolved audio state. Replacing properties lets normalized defaults remove stale fields. */
export interface AudioTimelineClipPatch {
  startFrame: number;
  durationFrames: number;
  sourceInSec: number;
  sourceOutSec: number | null;
  properties: AudioClipProperties;
}

export interface AudioTimelineClipPatchUpdate {
  clipId: TimelineClipId;
  patch: AudioTimelineClipPatch;
}

export type CaptionStylePatch = Partial<CaptionStyle>;
export type AppearancePatch = Partial<EditorDocumentV2['appearance']>;
export type ProcessingPatch = Partial<NonNullable<EditorDocumentV2['processing']>>;

type RelativeClipPlacement<Clip extends TimelineClip = TimelineClip> = Clip extends TimelineClip
  ? Omit<Clip, 'startFrame'> & { offsetFrames: number }
  : never;

export type TimelineClipPlacement = RelativeClipPlacement;

export type EditorCommand =
  | { type: 'canvas.patch'; patch: CanvasPatch }
  | { type: 'appearance.patch'; patch: AppearancePatch }
  | { type: 'processing.patch'; patch: ProcessingPatch }
  | { type: 'track.insert'; track: InsertTrackInput; index?: number }
  | { type: 'track.remove'; trackId: TrackId }
  | { type: 'track.patch'; trackId: TrackId; patch: TrackPatch }
  | { type: 'track.move'; trackId: TrackId; toIndex: number }
  | { type: 'clip.patch'; trackId: TrackId; clipId: TimelineClipId; patch: ClipPatch }
  | { type: 'clip.retime'; trackId: TrackId; clipId: TimelineClipId; durationFrames: number; ripple?: boolean }
  | { type: 'clip.move'; trackId: TrackId; clipId: TimelineClipId; startFrame: number; toTrackId?: TrackId; includeLinked?: boolean }
  | { type: 'clip.swapAsset'; trackId: TrackId; clipId: TimelineClipId; assetId: string }
  | { type: 'clips.link'; clipIds: TimelineClipId[]; groupId?: string }
  | { type: 'clips.unlink'; clipIds: TimelineClipId[] }
  | { type: 'overlay.patch'; updates: OverlayClipPatchUpdate[] }
  | { type: 'overlay.insert'; trackId: TrackId; clip: GraphicTimelineClip; asset?: EditorMediaAsset }
  | { type: 'overlay.move'; clipId: TimelineClipId; toTrackId: TrackId }
  | { type: 'overlay.duplicate'; clipId: TimelineClipId; newClipId: TimelineClipId; startFrame: number; toTrackId?: TrackId }
  | { type: 'audio.insert'; trackId: TrackId; clip: AudioTimelineClip; asset?: EditorMediaAsset }
  | { type: 'audio.patch'; updates: AudioTimelineClipPatchUpdate[] }
  | { type: 'captions.style'; patch: CaptionStylePatch }
  | {
    type: 'captions.relay';
    source?:
      | { mode: 'auto' }
      | { mode: 'track'; trackId: TrackId }
      | { mode: 'clip'; clipId: TimelineClipId };
  }
  | {
    type: 'narrative.insert';
    atFrame: number;
    clip: Omit<NarrativeTimelineClip, 'startFrame'>;
    asset?: EditorMediaAsset;
    mode?: 'ripple' | 'overwrite';
    /** Director scene that owns this inserted interval; inferred by placement when omitted. */
    sceneId?: string;
  }
  | { type: 'narrative.reorder'; clipIds: TimelineClipId[] }
  | { type: 'clips.remove'; trackId: TrackId; clipIds: TimelineClipId[]; includeLinked?: boolean }
  | {
    type: 'clips.insert';
    trackId: TrackId;
    atFrame: number;
    /** Offsets are relative to atFrame, allowing compound same-lane inserts to stay atomic. */
    clips: TimelineClipPlacement[];
    mode: 'overwrite' | 'ripple';
    includeLinked?: boolean;
    /** Director scene that owns the inserted visual interval; inferred from overlap when omitted. */
    sceneId?: string;
  }
  | {
    type: 'range.remove';
    trackId: TrackId;
    startFrame: number;
    endFrame: number;
    mode: 'lift' | 'ripple';
    /** Linked partners are an editing invariant by default, but callers may explicitly unlink an operation. */
    includeLinked?: boolean;
    /** Empty lanes are retained by default so the user's track layout remains stable. */
    pruneEmptyTracks?: boolean;
  }
  | {
    type: 'clip.split';
    trackId: TrackId;
    clipId: TimelineClipId;
    atFrame: number;
    /** Linked partners split at the same timeline frame by default. */
    includeLinked?: boolean;
  }
  | { type: 'narrative.patch'; updates: NarrativeClipPatchUpdate[] };

export type EditorCommandErrorCode =
  | 'invalid-command'
  | 'invalid-range'
  | 'invalid-document'
  | 'track-not-found'
  | 'clip-not-found'
  | 'duplicate-track-id'
  | 'duplicate-clip-id'
  | 'invalid-track-role'
  | 'primary-track-required'
  | 'track-locked';

export interface EditorCommandError {
  code: EditorCommandErrorCode;
  message: string;
  path?: string;
  trackIds?: TrackId[];
}

export interface EditorCommandReceipt {
  commandType: EditorCommand['type'];
  affectedTrackIds: TrackId[];
  removedTrackIds: TrackId[];
  removedClipIds: TimelineClipId[];
  createdClipIds: TimelineClipId[];
  shiftedClipIds: TimelineClipId[];
  removedFrames?: number;
}

export type EditorCommandResult =
  | { ok: true; document: EditorDocumentV2; receipt: EditorCommandReceipt }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export function commandFailure(
  document: EditorDocumentV2,
  code: EditorCommandErrorCode,
  message: string,
  details: Pick<EditorCommandError, 'path' | 'trackIds'> = {},
): EditorCommandResult {
  return { ok: false, document, error: { code, message, ...details } };
}

export function emptyCommandReceipt(commandType: EditorCommand['type']): EditorCommandReceipt {
  return {
    commandType,
    affectedTrackIds: [],
    removedTrackIds: [],
    removedClipIds: [],
    createdClipIds: [],
    shiftedClipIds: [],
  };
}
