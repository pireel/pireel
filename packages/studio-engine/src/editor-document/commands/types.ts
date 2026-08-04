import type {
  EditorDocumentV2,
  EditorTrack,
  EditorTrackRole,
  EditorTrackType,
  TimelineClip,
  TimelineClipId,
  TrackId,
} from '../types';
import type { ShotFilter, ShotFramingPatch } from '../../composition-core';

export interface ShotAudioPatch {
  volumeDb?: number;
  mute?: boolean;
  fadeInSec?: number;
  fadeOutSec?: number;
}

export interface NarrativeClipPatch {
  framing?: ShotFramingPatch;
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

export type ClipPatch = Partial<Pick<TimelineClip, 'enabled'>>;

type RelativeClipPlacement<Clip extends TimelineClip = TimelineClip> = Clip extends TimelineClip
  ? Omit<Clip, 'startFrame'> & { offsetFrames: number }
  : never;

export type TimelineClipPlacement = RelativeClipPlacement;

export type EditorCommand =
  | { type: 'track.insert'; track: InsertTrackInput; index?: number }
  | { type: 'track.remove'; trackId: TrackId }
  | { type: 'track.patch'; trackId: TrackId; patch: TrackPatch }
  | { type: 'track.move'; trackId: TrackId; toIndex: number }
  | { type: 'clip.patch'; trackId: TrackId; clipId: TimelineClipId; patch: ClipPatch }
  | { type: 'captions.relay' }
  | {
    type: 'clips.insert';
    trackId: TrackId;
    atFrame: number;
    /** Offsets are relative to atFrame, allowing compound same-lane inserts to stay atomic. */
    clips: TimelineClipPlacement[];
    mode: 'overwrite' | 'ripple';
    includeLinked?: boolean;
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
