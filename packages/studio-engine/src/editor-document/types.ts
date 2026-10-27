import type { AudioClip } from '../audio-tracks';
import type { AtomicMediaFraming, Block, CaptionStyle, CutTransitionEffect, PersonFx, SourceBackdrop, TransitionDirection, VideoShot } from '../composition-core';
import type { TranscriptSegment } from '@pireel/studio-engine/project-types';
import type { ThemeId } from '../theme';
import type { NarrativeRole, SceneFamily, ViewerTask } from '../director-plan';
import type { DocumentLook } from '../look';
import type { PlaybookSnapshot } from '@pireel/studio-engine/project-brand-metadata';

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
    /** Search/agent-facing metadata. Media bytes stay in locator; these fields remain cloud-safe. */
    description?: string;
    tags?: string[];
    collection?: string;
    /** Exact spoken text of a synthesised speech asset. ASR only ever measures timing against it. */
    transcriptText?: string;
    /** Optional precomputed/declared musical grid metadata; media-byte analysis stays outside the document. */
    bpm?: number;
    beatOffsetSec?: number;
  };
  /** Cloud-safe library metadata. The file/directory handle remains device-local; this is enough
   * for another browser to render a restore card and ask for the original folder once. */
  library?: {
    createdAt: number;
    folder?: {
      id: string;
      name: string;
      path: string;
    };
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
  personFx?: PersonFx;
  /** The output's own video-level template (visual system + pieces); graphics instance it as `look:<pieceId>`. */
  look?: DocumentLook;
  /** Fill behind a main source that does not cover the canvas (see Composition.backdrop). */
  backdrop?: SourceBackdrop;
}

export type EditorTrackType = 'visual' | 'graphics' | 'audio' | 'caption';
export type EditorTrackRole = 'primaryNarrative' | 'broll' | 'graphics' | 'narration' | 'music' | 'sfx' | 'managedCaptions';

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
  /** A lane created on purpose (manage_tracks) survives commits while empty; derived lanes are pruned. */
  keepEmpty?: boolean;
  clips: TimelineClip[];
}

/** A transition on the transition lane: a window of the picture, placed by time, never tied to a cut.
 * A spine cut inside the window hands over between the two sides; without one the effect plays on
 * the running picture. */
export interface TimelineTransition {
  id: string;
  startFrame: number;
  durationFrames: number;
  effect: CutTransitionEffect;
  direction?: TransitionDirection;
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
  /** Stable transcript section for source-backed clips. Cleanup fragments inherit it;
   * explicit splits create a new section. Missing means this clip is its own section. */
  transcriptSectionId?: string;
}

export type NarrativeProperties = Omit<VideoShot, 'id' | 'src' | 'srcSig' | 'srcStart' | 'srcEnd' | 'mediaFraming'>;

export interface NarrativeTimelineClip extends TimelineClipBase {
  kind: 'narrative';
  assetId: AssetId;
  sourceInSec: number;
  sourceOutSec: number;
  /** Canvas-relative placement of the decoded video layer. May extend outside the canvas; omitted means full canvas. */
  box?: { x: number; y: number; w: number; h: number };
  /** Canonical layer transform/crop. Kept at clip level so primary and ordinary visual media share it. */
  mediaFraming?: AtomicMediaFraming;
  properties: NarrativeProperties;
}

/** Shot-scoped controls that stay attached when a video clip leaves the semantic primary lane.
 * `mediaFraming` remains the canonical layer geometry; these values preserve preset intent and
 * the clip's own grade/audio settings across multi-track moves. */
export type MediaVideoProperties = Pick<VideoShot, 'treatment'> & Partial<Pick<VideoShot,
  'treatSize' | 'treatCrop' | 'preciseFraming' | 'filter' | 'zoom' | 'personMatte'
  | 'volumeDb' | 'audioMuted' | 'audioFadeInSec' | 'audioFadeOutSec'
>>;

export interface MediaTimelineClip extends TimelineClipBase {
  kind: 'media';
  assetId: AssetId;
  sourceInSec: number;
  sourceOutSec: number;
  fit?: 'contain' | 'cover';
  /** Canvas-relative region occupied by this visual. May extend outside the canvas; omitted means full canvas. */
  box?: { x: number; y: number; w: number; h: number };
  mediaFraming?: AtomicMediaFraming;
  /** Present for video media. Images do not acquire shot/audio semantics. */
  video?: MediaVideoProperties;
  /** Source point retained by cover-cropping. */
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  /** Visual motion is clip-local and frame-addressed, so it survives fps-aware persistence/export. */
  keyframes?: {
    box?: Array<{ frame: number; x: number; y: number; w: number; h: number }>;
    opacity?: Array<{ frame: number; value: number }>;
  };
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
  /** User trim relative to the cue's derived word timing. Keeping offsets instead of absolute
   *  frames lets the caption continue to follow its speech after upstream ripple edits. */
  timingOverride?: {
    startOffsetFrames: number;
    endOffsetFrames: number;
  };
  anchor: TimelineAnchor;
}

export type AudioClipProperties = Omit<AudioClip, 'id' | 'src' | 'sig' | 'durationSec' | 'startSec' | 'inSec' | 'outSec' | 'role'>;

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
  viewerTask?: ViewerTask;
  narrativeRole?: NarrativeRole;
  sceneFamily?: SceneFamily;
  customFamily?: string;
  purpose?: string;
}

export interface EditorSemanticState {
  primaryNarrativeTrackId: TrackId;
  managedCaptionTrackId?: TrackId;
  /** Persisted caption source selection. `auto` prefers visual speech, then narration audio. */
  managedCaptionSource?:
    | { mode: 'auto' }
    | { mode: 'track'; trackId: TrackId }
    | { mode: 'clip'; clipId: TimelineClipId };
  transcripts: Record<AssetId, TranscriptSegment[]>;
  scenes: SemanticScene[];
  /** Opaque optional semantic artifacts. Consumers must decode them by key; core validity ignores them. */
  artifacts?: unknown;
  /** Legacy arbitrary storyboard context. Retained for compatibility; new work uses the Director Plan artifact. */
  plan?: unknown;
  /** What the agent hands back for the creator to confirm: facts it could not verify, and music or
   *  voice choices that need the creator's say before they are used. Never design choices. */
  handoff?: HandoffItem[];
  /** Editing skills the creator switched on for this project (editing-skills.ts ids). */
  editingSkills?: string[];
  /** The brand this project is edited with: a copy taken when it was picked, so later edits of the
   *  brand never restyle the project. null = picked to edit without a brand; absent = never set. */
  brand?: PlaybookSnapshot | null;
  /** The Studio Skill (kind of video) this project is edited as; 'auto' = none; absent = never set.
   *  A brand only goes with a Skill that takes brands (brand-playbook BRAND_SKILL_IDS). */
  skillId?: string;
  /** Initial Agent model chosen when this project was created; saved chats keep their own selection. */
  agentModel?: 'auto' | 'deepseek' | 'opus' | 'sonnet' | 'gpt-sol';
}

export interface HandoffItem {
  id: string;
  kind: 'fact' | 'music' | 'voice';
  /** What to confirm, in the creator's language. */
  text: string;
  /** Where it comes from (a clip id, a transcript row, a source name…). */
  ref?: string;
  status: 'open' | 'confirmed' | 'changed';
  /** The creator's answer when it was changed. */
  answer?: string;
}

export interface EditorDocumentV2 {
  version: typeof EDITOR_DOCUMENT_VERSION;
  canvas: EditorCanvasSettings;
  appearance: EditorAppearance;
  assets: Record<AssetId, EditorMediaAsset>;
  /** transitions: effects placed anywhere on the timeline (their own lane); none is tied to a cut. */
  timeline: { tracks: EditorTrack[]; transitions?: TimelineTransition[] };
  semantics: EditorSemanticState;
  processing?: {
    audioDenoise?: { strength: number };
    /** Whole-mix loudness: a master gain (dB) bringing the programme to `targetLufs`, applied with a
     *  peak limiter in preview and export. Every clip keeps its own level under it. */
    loudness?: { targetLufs: number; gainDb: number };
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
