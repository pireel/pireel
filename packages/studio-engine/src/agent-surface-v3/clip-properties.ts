/**
 * Agent surface v3 — the clip capability table.
 *
 * ONE declaration of what each clip kind takes through set_clip_properties: the field, the kinds
 * that accept it, what a media clip must be for it to apply, the effective default the reader
 * strips, and where the agent goes instead when a kind does not take the field. The published
 * schema, the handler's per-kind gate, the get_state read-back defaults and the refusal texts are
 * all derived from this table, so a kind gaining or losing a property is one edit, and a refusal
 * always names the tool that does the job (the same idea as component-schema.ts for components).
 */
import { audioFadeDefaults, type AudioClipRole } from '../audio-tracks';
import type { EditorDocumentV2, TimelineClip } from '../editor-document/types';

export type DocumentClipKind = TimelineClip['kind'];
export type ClipPropertyKey =
  | 'source' | 'durationFrames' | 'speed' | 'ripple' | 'volumeDb' | 'mute' | 'fades' | 'filter'
  | 'opacity' | 'enabled' | 'box' | 'props';

export interface ClipPropertySpec {
  key: ClipPropertyKey;
  /** Document clip kinds that take the field. */
  kinds: readonly DocumentClipKind[];
  /** A media clip takes the field only when its asset is video (images have no sound, speed or grade). */
  needsVideo?: boolean;
  /** One phrase for the generated per-kind summary in the tool description. */
  summary: string;
  /** Where the agent goes for a kind that does not take the field; the generic redirect otherwise. */
  elsewhere?: Partial<Record<DocumentClipKind, string>>;
}

const SPINE_FRAMING = 'A story-spine clip is framed with set_clip_framing / box; its level and fades are set here with volumeDb / fades.';
const CAPTIONS = 'Captions are one layer edited with set_captions (style, yPct, scale, corrections, translations); cue clips take only enabled here.';
const MEDIA_LENGTH = "a media clip's length follows its source span — pass source [inSec, outSec] instead";

export const CLIP_PROPERTIES: readonly ClipPropertySpec[] = [
  { key: 'source', kinds: ['narrative', 'media', 'audio'], needsVideo: true, summary: 'source [inSec,outSec] retrims (length follows the span)',
    elsewhere: { graphic: 'a graphic clip has no source; resize it with durationFrames', caption: CAPTIONS } },
  { key: 'durationFrames', kinds: ['graphic'], summary: 'durationFrames resizes graphic and text clips',
    elsewhere: { narrative: MEDIA_LENGTH, media: MEDIA_LENGTH, audio: MEDIA_LENGTH, caption: CAPTIONS } },
  { key: 'speed', kinds: ['narrative', 'media', 'audio'], needsVideo: true, summary: 'speed 0.25–4 (the spine ripples by default)',
    elsewhere: { graphic: 'a graphic clip has no playback speed; retime it with durationFrames or animate through apply_component', caption: CAPTIONS } },
  { key: 'ripple', kinds: ['narrative'], summary: 'ripple modifies speed on the spine',
    elsewhere: { media: 'ripple applies to speed on the story spine only; other lanes never ripple', audio: 'ripple applies to speed on the story spine only; other lanes never ripple', graphic: 'ripple applies to speed on the story spine only', caption: CAPTIONS } },
  { key: 'volumeDb', kinds: ['narrative', 'media', 'audio'], needsVideo: true, summary: 'volumeDb −60…+20 (0 = source level)',
    elsewhere: { graphic: 'a graphic clip has no sound', caption: CAPTIONS } },
  { key: 'mute', kinds: ['narrative', 'media', 'audio'], needsVideo: true, summary: 'mute',
    elsewhere: { graphic: 'a graphic clip has no sound', caption: CAPTIONS } },
  { key: 'fades', kinds: ['narrative', 'media', 'audio'], needsVideo: true, summary: 'fades {in,out} in frames',
    elsewhere: { graphic: 'a graphic clip has no audio fades; its entrance and exit are part of the component (apply_component)', caption: CAPTIONS } },
  { key: 'filter', kinds: ['narrative', 'media'], needsVideo: true, summary: 'filter {brightness,contrast,saturate} grades video (1 = untouched)',
    elsewhere: { audio: 'an audio clip has no picture to grade', graphic: 'a graphic clip is not graded; change its colours through apply_component', caption: CAPTIONS } },
  { key: 'opacity', kinds: ['media'], summary: 'opacity 0–1 on B-roll and image clips',
    elsewhere: { narrative: `opacity applies to B-roll, image and graphic clips. ${SPINE_FRAMING}`, graphic: 'a graphic clip has no opacity property; change the component through apply_component or move it with box', audio: 'an audio clip has no picture', caption: CAPTIONS } },
  { key: 'enabled', kinds: ['narrative', 'media', 'graphic', 'audio', 'caption'], summary: 'enabled' },
  { key: 'box', kinds: ['narrative', 'media', 'graphic'], summary: 'box {x,y,w,h} in canvas units',
    elsewhere: { audio: 'an audio clip has no picture', caption: 'Position the caption layer with set_captions yPct / scale' } },
  { key: 'props', kinds: ['graphic'], summary: 'props [{key,value}] sets a graphic clip’s declared editable properties (keys from component.props in get_state)',
    elsewhere: { narrative: 'props belong to graphic components; a story-spine clip has none', media: 'props belong to graphic components; a media clip has none', audio: 'props belong to graphic components; an audio clip has none', caption: CAPTIONS } },
];

/** Fields agents send here that belong to another tool. The schema refuses them; the fix names the tool. */
export const CLIP_PROPERTY_REDIRECTS: Readonly<Record<string, string>> = {
  assetId: "Replacing a clip's media is swap_clip_media {clipId, assetId}.",
  keyframes: 'Animated box / opacity is set_keyframes {clipId, property, keyframes}.',
  startFrame: 'Timing moves are move_clips {items: [{clipId, startFrame, trackId?}]}.',
  trackId: 'Moving a clip between lanes is move_clips {items: [{clipId, startFrame, trackId}]}.',
  treatment: 'Where a clip sits in the picture is set_clip_framing (treatment, size, crop, transform, cropInsets, anchor).',
  transform: 'Where a clip sits in the picture is set_clip_framing (treatment, size, crop, transform, cropInsets, anchor).',
  cropInsets: 'Where a clip sits in the picture is set_clip_framing (treatment, size, crop, transform, cropInsets, anchor).',
  anchor: 'Where a clip sits in the picture is set_clip_framing (treatment, size, crop, transform, cropInsets, anchor).',
  scale: 'Where a clip sits in the picture is set_clip_framing (treatment, size, crop, transform, cropInsets, anchor).',
  text: 'Title text and its look are set_texts.',
  preset: 'Title presets are set_texts; caption presets are set_captions.',
  muted: 'The field is mute.',
  volume: 'The field is volumeDb (−60…+20, 0 = source level).',
  fadeIn: 'Fades are fades {in, out} in frames.',
  fadeOut: 'Fades are fades {in, out} in frames.',
};

export const CLIP_PROPERTY_KEYS: readonly ClipPropertyKey[] = CLIP_PROPERTIES.map((spec) => spec.key);

const KIND_LABEL: Record<DocumentClipKind, string> = {
  narrative: 'story-spine (narrative) clips',
  media: 'B-roll and image (media) clips',
  graphic: 'graphic and text clips',
  audio: 'audio clips',
  caption: 'caption cue clips',
};

/** What the handler needs to know about the clip: its kind and, for media, what its asset is. */
export interface ClipCapabilityContext {
  kind: DocumentClipKind;
  assetKind?: 'video' | 'image' | 'audio';
}

export function clipCapabilityContext(document: EditorDocumentV2, clip: TimelineClip): ClipCapabilityContext {
  const assetId = 'assetId' in clip ? clip.assetId : undefined;
  const asset = assetId ? document.assets[assetId] : undefined;
  return { kind: clip.kind, ...(asset ? { assetKind: asset.kind } : {}) };
}

export interface ClipFieldRefusal {
  /** The receipt's fix: what to do instead. */
  fix: string;
}

/** Null when the clip takes the field; otherwise the fix naming where the field belongs. Keys the
 * table does not know are left to schema validation. */
export function clipFieldRefusal(ctx: ClipCapabilityContext, key: string): ClipFieldRefusal | null {
  const redirect = CLIP_PROPERTY_REDIRECTS[key];
  if (redirect) return { fix: redirect };
  const spec = CLIP_PROPERTIES.find((candidate) => candidate.key === key);
  if (!spec) return null;
  if (!spec.kinds.includes(ctx.kind)) {
    const takers = spec.kinds.map((kind) => KIND_LABEL[kind]).join(', ');
    return { fix: spec.elsewhere?.[ctx.kind] ?? `${key} applies to ${takers}.` };
  }
  if (spec.needsVideo && ctx.kind === 'media' && ctx.assetKind !== 'video') {
    return { fix: `${key} applies to video and audio; this media clip shows a${ctx.assetKind === 'image' ? 'n image' : ` ${ctx.assetKind ?? 'non-video asset'}`}. Images take opacity, box, enabled and set_clip_framing.` };
  }
  return null;
}

/** The fields a kind takes, in table order. */
export function clipPropertiesFor(kind: DocumentClipKind): ClipPropertyKey[] {
  return CLIP_PROPERTIES.filter((spec) => spec.kinds.includes(kind)).map((spec) => spec.key);
}

/** One sentence per kind for the tool description, generated so it cannot drift from the table. */
export function clipPropertySummary(): string {
  const kinds: DocumentClipKind[] = ['narrative', 'media', 'graphic', 'audio', 'caption'];
  return kinds.map((kind) => {
    const keys = clipPropertiesFor(kind);
    const note = kind === 'media' ? ' (image clips: opacity, box, enabled only)' : '';
    return `${KIND_LABEL[kind]} take ${keys.join(', ')}${note}`;
  }).join('; ') + '.';
}

/* ------------------------------------------------------------- read-back defaults */

/** Effective defaults the state reader omits: a clip reports only what differs from these. */
export function clipPropertyDefaults(kind: DocumentClipKind, role?: AudioClipRole): Record<string, unknown> {
  switch (kind) {
    case 'narrative':
      return { treatment: 'full', speed: 1, volumeDb: 0, audioMuted: false, treatSize: 50, treatCrop: 50 };
    case 'media':
      return { treatment: 'full', speed: 1, volumeDb: 0, audioMuted: false, treatSize: 50, treatCrop: 50, fit: 'cover', opacity: 1, anchorX: 0.5, anchorY: 0.5 };
    case 'audio':
      return { speed: 1, muted: false, ...audioFadeDefaults(role) };
    default:
      return {};
  }
}

/** The document stores an audio fade only when it differs from the lane's default (a music bed
 *  fades 0.8 s in / 1.5 s out on its own); the reader gets the effective value, never the storage rule. */
export function effectiveAudioClipProperties(properties: Record<string, unknown>, trackRole: string | undefined): { role: AudioClipRole | undefined; properties: Record<string, unknown> } {
  const role: AudioClipRole | undefined = typeof properties.role === 'string'
    ? properties.role as AudioClipRole
    : trackRole === 'narration' || trackRole === 'sfx' ? trackRole : trackRole === 'music' ? undefined : 'audio';
  const fades = audioFadeDefaults(role);
  const { role: _role, ...rest } = properties;
  return { role, properties: { ...rest, fadeInSec: properties.fadeInSec ?? fades.fadeInSec, fadeOutSec: properties.fadeOutSec ?? fades.fadeOutSec } };
}
