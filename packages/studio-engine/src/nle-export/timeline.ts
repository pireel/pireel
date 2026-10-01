/**
 * The document as a plain multitrack timeline that other editors can rebuild: media files, video
 * tracks bottom to top, audio tracks, dissolves at cuts. Writers for each interchange format
 * (xmeml.ts, fcpxml.ts) read only this, so the projection rules live in one place.
 *
 * What survives: cuts, source in/out, speed, track order, enabled state, clip volume and fades,
 * opacity, placement (scale + position of a layer), dissolves where the source has handles.
 * Graphics arrive as pre-rendered transparent videos (one file per graphic clip, full canvas);
 * captions travel separately as subtitles. Everything else (crop, filters, zoom moves, keyframed
 * motion, word masks, other transition looks) is named in `notes` so nothing is dropped silently.
 */

import { audioClipDefaults } from '../audio-tracks';
import type { AudioClip } from '../audio-tracks';
import { editorDocumentRenderPlan, type EditorRenderClip } from '../editor-document/render-plan';
import type { EditorDocumentV2, EditorMediaAsset, TimelineClip } from '../editor-document/types';

export interface NleMedia {
  /** Unique within the timeline; writers derive their own ids from it. */
  key: string;
  /** Path inside the export package, forward slashes ("media/01-intro.mp4"). */
  path: string;
  name: string;
  kind: 'video' | 'image' | 'audio';
  /** Seconds; 0 for still images. */
  durationSec: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Carries an alpha channel (rendered graphics). */
  alpha?: boolean;
}

export interface NlePlacement {
  /** Uniform scale relative to the media's native pixel size. */
  scale: number;
  /** Offset of the layer centre from the canvas centre, canvas pixels (+x right, +y down). */
  offsetX: number;
  offsetY: number;
}

export interface NleClip {
  id: string;
  name: string;
  media: string;
  startFrame: number;
  durationFrames: number;
  /** Source seconds where the clip begins. */
  sourceInSec: number;
  /** Source seconds consumed per timeline second (1 = normal speed). */
  speed: number;
  enabled: boolean;
  /** Audio gain in dB (audio clips, and the sound of video clips). */
  volumeDb?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** 0..1, video only; omitted = fully opaque. */
  opacity?: number;
  /** Omitted = full-canvas cover fit. */
  placement?: NlePlacement;
  /** The audio clip carrying this video clip's own sound (and back). */
  linkedTo?: string;
}

export interface NleTrack {
  name: string;
  clips: NleClip[];
}

export interface NleTransition {
  /** The cut on the lowest video track the dissolve is centred on. */
  cutFrame: number;
  durationFrames: number;
  leftClipId: string;
  rightClipId: string;
}

export interface NleTimeline {
  name: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  media: NleMedia[];
  /** Bottom to top; index 0 is the main story. */
  videoTracks: NleTrack[];
  audioTracks: NleTrack[];
  /** Dissolves on videoTracks[0]. */
  transitions: NleTransition[];
  /** What could not be carried over (codes; the exporter words them for the package README). */
  notes: NleNote[];
}

export type NleNoteCode =
  | 'unknown-size' | 'crop' | 'window-crop' | 'missing-media' | 'graphic-missing' | 'filter' | 'zoom'
  | 'keyframes' | 'transition-off-cut' | 'transition-no-handles' | 'transition-look' | 'denoise';

export interface NleNote {
  code: NleNoteCode;
  /** Names of what the note is about (missing media, unrendered graphics). */
  items?: string[];
}

export interface NleMediaFile {
  path: string;
  /** Measured by the exporter when the document has no metadata; overrides the document's. */
  durationSec?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export interface BuildNleTimelineOptions {
  name: string;
  /** Where an asset's bytes land in the package; null = unavailable (its clips are skipped and noted). */
  mediaFile: (asset: EditorMediaAsset) => NleMediaFile | null;
  /** Where a graphic clip's rendered transparent video lands; null = not rendered (skipped and noted). */
  graphicFile: (clipId: string) => string | null;
  /** A cleaned-up sound file standing in for an asset's own audio (denoise), aligned to the source. */
  audioReplacement?: (asset: EditorMediaAsset) => NleMediaFile | null;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** A content fingerprint (`pireel2:<hash>:<size>`) or bare hash says nothing to a person reading a timeline. */
const isFingerprint = (label: string) => /^[a-z0-9]+:[0-9a-f]{16,}:\d+$/i.test(label) || /^[0-9a-f]{24,}$/i.test(label);

/** The name a clip and its media show in the other editor. */
export function nleAssetName(asset: EditorMediaAsset, fallback: string): string {
  const label = asset.label?.trim();
  return label && !isFingerprint(label) ? label : fallback;
}

export function buildNleTimeline(document: EditorDocumentV2, options: BuildNleTimelineOptions): NleTimeline {
  const plan = editorDocumentRenderPlan(document);
  const { width: W, height: H, fps } = document.canvas;
  const media = new Map<string, NleMedia>();
  const notes = new Map<NleNoteCode, Set<string>>();
  const note = (code: NleNoteCode, item?: string) => {
    const items = notes.get(code) ?? new Set<string>();
    if (item) items.add(item);
    notes.set(code, items);
  };
  const videoTracks: NleTrack[] = [];
  const laneAudio: NleTrack[] = [];
  const audioTracks: NleTrack[] = [];

  const assetMedia = (asset: EditorMediaAsset): NleMedia | null => {
    const key = `asset:${asset.id}`;
    const known = media.get(key);
    if (known) return known;
    const file = options.mediaFile(asset);
    if (!file) return null;
    const entry: NleMedia = {
      key,
      path: file.path,
      name: nleAssetName(asset, file.path.split('/').pop() || asset.id),
      kind: asset.kind,
      durationSec: asset.kind === 'image' ? 0 : file.durationSec ?? asset.metadata.durationSec ?? 0,
      ...(file.width ?? asset.metadata.width ? { width: file.width ?? asset.metadata.width } : {}),
      ...(file.height ?? asset.metadata.height ? { height: file.height ?? asset.metadata.height } : {}),
      hasVideo: asset.kind !== 'audio',
      hasAudio: asset.kind !== 'image' && (file.hasAudio ?? asset.metadata.hasAudio ?? asset.kind === 'audio'),
    };
    media.set(key, entry);
    return entry;
  };

  const replacementMedia = (asset: EditorMediaAsset): NleMedia | null => {
    const file = options.audioReplacement?.(asset);
    if (!file) return null;
    const key = `audio-replacement:${asset.id}`;
    const entry: NleMedia = media.get(key) ?? {
      key,
      path: file.path,
      name: file.path.split('/').pop() || `${asset.id}-audio`,
      kind: 'audio',
      durationSec: file.durationSec ?? asset.metadata.durationSec ?? 0,
      hasVideo: false,
      hasAudio: true,
    };
    media.set(key, entry);
    return entry;
  };

  /** Scale and centre offset of a visual layer: the box it occupies, the fit inside it, then the layer transform. */
  const placementOf = (
    clip: Extract<TimelineClip, { kind: 'narrative' | 'media' }>,
    entry: NleMedia,
  ): NlePlacement | undefined => {
    const mw = entry.width;
    const mh = entry.height;
    if (!mw || !mh) {
      note('unknown-size');
      return undefined;
    }
    const box = clip.box ?? { x: 0, y: 0, w: 1, h: 1 };
    const lw = box.w * W;
    const lh = box.h * H;
    const fit = clip.kind === 'media' ? clip.fit ?? 'cover' : 'cover';
    const base = fit === 'contain' ? Math.min(lw / mw, lh / mh) : Math.max(lw / mw, lh / mh);
    const transform = clip.mediaFraming?.transform;
    const crop = clip.mediaFraming?.crop;
    if (crop && (crop.top || crop.right || crop.bottom || crop.left)) note('crop');
    const coversBox = fit === 'cover' && (Math.abs(lw / mw - lh / mh) > 1e-3) && (box.w < 0.999 || box.h < 0.999);
    if (coversBox) note('window-crop');
    const scale = base * (transform?.scale ?? 1);
    const offsetX = (box.x + box.w / 2) * W - W / 2 + (transform?.offsetX ?? 0) * lw;
    const offsetY = (box.y + box.h / 2) * H - H / 2 + (transform?.offsetY ?? 0) * lh;
    return { scale: round3(scale), offsetX: round3(offsetX), offsetY: round3(offsetY) };
  };

  const speedOf = (entry: EditorRenderClip, sourceInSec: number, sourceOutSec: number | undefined) =>
    sourceOutSec === undefined || entry.durationSec <= 0 ? 1 : round3((sourceOutSec - sourceInSec) / entry.durationSec);

  for (const track of plan.tracks) {
    if (track.type === 'caption') continue;
    if (track.type === 'audio') {
      const clips: NleClip[] = [];
      for (const entry of track.clips) {
        const clip = entry.clip;
        if (clip.kind !== 'audio' || !entry.asset) continue;
        const file = assetMedia(entry.asset);
        if (!file) { note('missing-media', nleAssetName(entry.asset, entry.asset.id)); continue; }
        const resolved = audioClipDefaults({
          ...(clip.properties as Partial<AudioClip>),
          id: clip.id,
          src: '',
          ...(track.role === 'music' || track.role === 'narration' || track.role === 'sfx' ? { role: track.role } : {}),
          inSec: clip.sourceInSec,
          ...(clip.sourceOutSec !== undefined ? { outSec: clip.sourceOutSec } : {}),
          ...(file.durationSec ? { durationSec: file.durationSec } : {}),
        } as AudioClip);
        clips.push({
          id: clip.id,
          name: file.name,
          media: file.key,
          startFrame: entry.startFrame,
          durationFrames: entry.endFrame - entry.startFrame,
          sourceInSec: clip.sourceInSec,
          speed: resolved.speed,
          enabled: clip.enabled && !track.muted && !clip.properties.muted,
          volumeDb: resolved.volumeDb,
          ...(resolved.fadeInSec > 0 ? { fadeInSec: round3(resolved.fadeInSec) } : {}),
          ...(resolved.fadeOutSec > 0 ? { fadeOutSec: round3(resolved.fadeOutSec) } : {}),
        });
      }
      audioTracks.push({ name: track.role === 'music' ? 'Music' : track.role === 'narration' ? 'Narration' : track.role === 'sfx' ? 'Sound effects' : 'Audio', clips });
      continue;
    }

    // Visual and graphics lanes; a lane's own sound goes to an audio track of its own.
    const clips: NleClip[] = [];
    const sound: NleClip[] = [];
    for (const entry of track.clips) {
      const clip = entry.clip;
      const durationFrames = entry.endFrame - entry.startFrame;
      if (durationFrames <= 0) continue;
      const enabled = clip.enabled && !track.hidden;
      if (clip.kind === 'graphic') {
        const path = options.graphicFile(clip.id);
        if (!path) { note('graphic-missing', clip.block.label ?? clip.id); continue; }
        const key = `graphic:${clip.id}`;
        media.set(key, {
          key,
          path,
          name: path.split('/').pop() ?? clip.id,
          kind: 'video',
          durationSec: durationFrames / fps,
          width: W,
          height: H,
          hasVideo: true,
          hasAudio: false,
          alpha: true,
        });
        clips.push({
          id: clip.id,
          name: clip.block.label || 'Graphic',
          media: key,
          startFrame: entry.startFrame,
          durationFrames,
          sourceInSec: 0,
          speed: 1,
          enabled,
          placement: { scale: 1, offsetX: 0, offsetY: 0 },
        });
        continue;
      }
      if ((clip.kind !== 'narrative' && clip.kind !== 'media') || !entry.asset) continue;
      const file = assetMedia(entry.asset);
      if (!file) { note('missing-media', nleAssetName(entry.asset, entry.asset.id)); continue; }
      const isImage = file.kind === 'image';
      const speed = isImage ? 1 : speedOf(entry, clip.sourceInSec, clip.sourceOutSec);
      const props = clip.kind === 'narrative' ? clip.properties : clip.video;
      if (props?.filter) note('filter');
      if (props?.zoom) note('zoom');
      if (clip.kind === 'media' && clip.keyframes && (clip.keyframes.box?.length || clip.keyframes.opacity?.length)) note('keyframes');
      const placement = placementOf(clip, file);
      const opacity = clip.kind === 'media' && clip.opacity !== undefined && clip.opacity < 1 ? round3(clip.opacity) : undefined;
      const video: NleClip = {
        id: clip.id,
        name: file.name,
        media: file.key,
        startFrame: entry.startFrame,
        durationFrames,
        sourceInSec: isImage ? 0 : clip.sourceInSec,
        speed,
        enabled,
        ...(opacity !== undefined ? { opacity } : {}),
        ...(placement ? { placement } : {}),
      };
      clips.push(video);
      if (!isImage && file.hasAudio) {
        const replacement = replacementMedia(entry.asset);
        const audioId = `${clip.id}-audio`;
        video.linkedTo = audioId;
        sound.push({
          id: audioId,
          name: file.name,
          media: replacement?.key ?? file.key,
          startFrame: entry.startFrame,
          durationFrames,
          sourceInSec: clip.sourceInSec,
          speed,
          enabled: clip.enabled && !track.muted && !props?.audioMuted,
          volumeDb: props?.volumeDb ?? 0,
          ...(props?.audioFadeInSec ? { fadeInSec: props.audioFadeInSec } : {}),
          ...(props?.audioFadeOutSec ? { fadeOutSec: props.audioFadeOutSec } : {}),
          linkedTo: clip.id,
        });
      }
    }
    const isPrimary = track.id === plan.primaryNarrativeTrackId;
    const name = isPrimary ? 'Main' : track.type === 'graphics' ? 'Graphics' : 'B-roll';
    // The main story stays the lowest track even when a document lists it elsewhere.
    if (isPrimary) videoTracks.unshift({ name, clips });
    else videoTracks.push({ name, clips });
    if (sound.length) {
      if (isPrimary) laneAudio.unshift({ name: `${name} audio`, clips: sound });
      else laneAudio.push({ name: `${name} audio`, clips: sound });
    }
  }
  if (!videoTracks.length) videoTracks.push({ name: 'Main', clips: [] });

  // Dissolves: only where a transition window holds a cut on the main track and both sides have source handles.
  const transitions: NleTransition[] = [];
  const main = videoTracks[0]!.clips;
  for (const transition of document.timeline.transitions ?? []) {
    const from = transition.startFrame;
    const to = transition.startFrame + transition.durationFrames;
    const cutIndex = main.findIndex((clip, index) => {
      const next = main[index + 1];
      const cut = clip.startFrame + clip.durationFrames;
      return !!next && next.startFrame === cut && cut > from && cut < to;
    });
    if (cutIndex < 0) { note('transition-off-cut'); continue; }
    const left = main[cutIndex]!;
    const right = main[cutIndex + 1]!;
    const cutFrame = left.startFrame + left.durationFrames;
    const half = Math.min(cutFrame - from, to - cutFrame);
    const leftMedia = media.get(left.media);
    const leftTail = leftMedia && leftMedia.kind !== 'image'
      ? leftMedia.durationSec - (left.sourceInSec + (left.durationFrames / fps) * left.speed)
      : Infinity;
    const rightHead = media.get(right.media)?.kind === 'image' ? Infinity : right.sourceInSec;
    const handleFrames = Math.floor(Math.min(leftTail / left.speed, rightHead / right.speed) * fps);
    const halfFrames = Math.min(half, handleFrames);
    if (halfFrames < 1) { note('transition-no-handles'); continue; }
    if (transition.effect !== 'fade') note('transition-look');
    transitions.push({ cutFrame, durationFrames: halfFrames * 2, leftClipId: left.id, rightClipId: right.id });
  }

  if (document.processing?.audioDenoise && !options.audioReplacement) note('denoise');

  return {
    name: options.name,
    width: W,
    height: H,
    fps,
    durationFrames: plan.durationFrames,
    media: [...media.values()],
    videoTracks,
    audioTracks: [...laneAudio, ...audioTracks],
    transitions,
    notes: [...notes].map(([code, items]) => (items.size ? { code, items: [...items] } : { code })),
  };
}
