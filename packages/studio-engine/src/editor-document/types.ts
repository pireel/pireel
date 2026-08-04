import type { AudioClip } from '../audio-tracks';
import type { Block, CaptionStyle, PersonFx, VideoShot } from '../composition-core';
import type { TranscriptSegment } from '../project-dto';
import type { ThemeId } from '../theme';

export const EDITOR_DOCUMENT_VERSION = 2 as const;

export type AssetId = string;
export type TrackId = string;
export type TimelineClipId = string;
export type EditorAssetKind = 'video' | 'image' | 'audio';

/** Durable ways to recover media. Runtime object/blob URLs may be supplied by a resolver but are not identities. */
export interface EditorAssetLocator {
  localSig?: string;
  cloudKey?: string;
  remoteUrl?: string;
}

export interface EditorMediaAsset {
  id: AssetId;
  kind: EditorAssetKind;
  label?: string;
  locator: EditorAssetLocator;
  metadata: {
    durationSec?: number;
    width?: number;
    height?: number;
    hasAudio?: boolean;
  };
}

export interface EditorCanvasSettings {
  width: number;
  height: number;
  /** Project timebase. Timeline placement is integral frames; source trims remain source seconds. */
  fps: number;
  /** Distinguishes a deliberate canvas from untouched defaults when the first visual arrives. */
  configured: boolean;
}

export interface EditorAppearance {
  theme: ThemeId;
  palette?: Record<string, string>;
  captionStyle?: Partial<CaptionStyle>;
  frameId?: string;
  personFx?: PersonFx;
}

export type EditorTrackType = 'visual' | 'graphics' | 'audio' | 'caption';
export type EditorTrackRole = 'primaryNarrative' | 'broll' | 'graphics' | 'music' | 'managedCaptions';

export interface EditorTrack {
  id: TrackId;
  type: EditorTrackType;
  role?: EditorTrackRole;
  name?: string;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  /** Ripple edits affect this track when true. This is independent of editability (`locked`). */
  syncLocked: boolean;
  /** Global order across non-primary visual, graphics and caption tracks. Larger renders above smaller. */
  stackOrder: number;
  clips: TimelineClip[];
}

export type TimelineAnchor =
  | { type: 'timeline' }
  | { type: 'clip'; clipId: TimelineClipId; offsetFrames: number }
  | { type: 'word'; assetId: AssetId; segmentIndex: number; wordIndex: number; offsetFrames: number };

export interface TimelineClipBase {
  id: TimelineClipId;
  kind: 'narrative' | 'media' | 'graphic' | 'audio' | 'caption';
  startFrame: number;
  durationFrames: number;
  enabled: boolean;
  linkGroupId?: string;
}

export type NarrativeProperties = Omit<VideoShot, 'id' | 'src' | 'srcSig' | 'srcStart' | 'srcEnd'>;

export interface NarrativeTimelineClip extends TimelineClipBase {
  kind: 'narrative';
  assetId: AssetId;
  sourceInSec: number;
  sourceOutSec: number;
  properties: NarrativeProperties;
}

export interface MediaTimelineClip extends TimelineClipBase {
  kind: 'media';
  assetId: AssetId;
  sourceInSec: number;
  sourceOutSec: number;
  fit?: 'contain' | 'cover';
}

export type GraphicBlockPayload = Omit<Block, 'id' | 'startSec' | 'durationSec' | 'trackIndex'>;

export interface GraphicTimelineClip extends TimelineClipBase {
  kind: 'graphic';
  block: GraphicBlockPayload;
  /** Set for a media-template block; its URL is resolved from the manifest at projection/render time. */
  assetId?: AssetId;
  anchor: TimelineAnchor;
}

export interface CaptionSourceRef {
  assetId: AssetId;
  segmentIndex: number;
  wordStart: number;
  wordEnd: number;
}

export interface CaptionTimelineClip extends TimelineClipBase {
  kind: 'caption';
  block: GraphicBlockPayload;
  managed: boolean;
  sourceRef?: CaptionSourceRef;
  anchor: TimelineAnchor;
}

export type AudioClipProperties = Omit<AudioClip, 'id' | 'src' | 'sig' | 'durationSec' | 'startSec' | 'inSec' | 'outSec'>;

export interface AudioTimelineClip extends TimelineClipBase {
  kind: 'audio';
  assetId: AssetId;
  sourceInSec: number;
  sourceOutSec?: number;
  properties: AudioClipProperties;
  anchor: TimelineAnchor;
}

export type TimelineClip = NarrativeTimelineClip | MediaTimelineClip | GraphicTimelineClip | CaptionTimelineClip | AudioTimelineClip;

export interface SemanticScene {
  id: string;
  clipIds: TimelineClipId[];
  label?: string;
  intent?: string;
}

export interface EditorSemanticState {
  primaryNarrativeTrackId: TrackId;
  /** The original talking-head source. Inserted/B-roll sources have their own asset ids. */
  primaryNarrativeAssetId?: AssetId;
  managedCaptionTrackId?: TrackId;
  transcripts: Record<AssetId, TranscriptSegment[]>;
  scenes: SemanticScene[];
  /** Existing storyboard/agent plan, retained until scenes become its canonical representation. */
  plan?: unknown;
}

export interface EditorDocumentV2 {
  version: typeof EDITOR_DOCUMENT_VERSION;
  canvas: EditorCanvasSettings;
  appearance: EditorAppearance;
  assets: Record<AssetId, EditorMediaAsset>;
  timeline: { tracks: EditorTrack[] };
  semantics: EditorSemanticState;
  processing?: {
    audioDenoise?: { strength: number };
  };
}

export interface EditorDocumentIssue {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export interface EditorDocumentMigrationResult {
  document: EditorDocumentV2;
  issues: EditorDocumentIssue[];
}

export interface LegacyProjectionOptions {
  /** Runtime resolver for OPFS/object URLs. Persisted locators remain durable and browser-independent. */
  resolveAssetUrl?: (asset: EditorMediaAsset) => string | null | undefined;
}
