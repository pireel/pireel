/**
 * FCPXML 1.9: Final Cut Pro, and DaVinci Resolve (which reads up to 1.9).
 *
 * The main video track is the primary storyline (clips and gaps in the spine, dissolves between
 * them); every other track is connected to the spine element under its start — video above
 * (lane 1, 2, …), audio below (lane -1, -2, …). A video clip carries its own sound, so a linked
 * audio clip folds into its video clip unless it plays a different file (cleaned-up audio), in
 * which case the video is silenced and the replacement is connected below.
 *
 * Units: times are rationals of the frame duration; volume is dB; position is in percent of the
 * frame height from the centre (+y up); with spatial conform "none", scale is relative to the
 * media's native pixel size, so the same numbers as the other formats apply.
 */

import type { NleClip, NleTimeline } from './timeline';
import { fileUrl, secondsToFrames, timebaseOf, xmlAttr } from './xml';

export interface FcpxmlOptions {
  /** File URL of the unpacked package folder, ending with "/". */
  rootUrl: string;
}

const CROSS_DISSOLVE_UID = 'FxPlug:4731E73A-8DAC-4113-9A30-AE85B1761265';
const SILENT_DB = -96;

interface SpineEntry {
  kind: 'clip' | 'gap';
  clip?: NleClip;
  offset: number;
  duration: number;
  /** The element's own local time at its offset (its start), in timeline frames. */
  localStart: number;
  anchored: string[];
}

export function toFcpxml(timeline: NleTimeline, options: FcpxmlOptions): string {
  const { fps, width: W, height: H } = timeline;
  const tb = timebaseOf(fps);
  const t = (frames: number) => (frames === 0 ? '0s' : `${Math.round(frames) * tb.frameNum}/${tb.frameDen}s`);
  const frameDuration = `${tb.frameNum}/${tb.frameDen}s`;
  const media = new Map(timeline.media.map((entry) => [entry.key, entry]));

  // Resources: the sequence format, one format + asset per media file, the dissolve effect.
  let next = 1;
  const rid = () => `r${next++}`;
  const sequenceFormat = rid();
  const resources: string[] = [`<format id="${sequenceFormat}" frameDuration="${frameDuration}" width="${W}" height="${H}"/>`];
  const assetIds = new Map<string, string>();
  for (const entry of timeline.media) {
    const formatId = rid();
    const assetId = rid();
    assetIds.set(entry.key, assetId);
    resources.push(entry.hasVideo
      ? `<format id="${formatId}"${entry.kind === 'image' ? '' : ` frameDuration="${frameDuration}"`}${entry.width ? ` width="${entry.width}"` : ''}${entry.height ? ` height="${entry.height}"` : ''}/>`
      : '');
    const duration = entry.kind === 'image' ? '0s' : t(secondsToFrames(entry.durationSec, fps));
    resources.push(
      `<asset id="${assetId}" name="${xmlAttr(entry.name)}" start="0s" duration="${duration}" hasVideo="${entry.hasVideo ? 1 : 0}" hasAudio="${entry.hasAudio ? 1 : 0}"`
      + `${entry.hasVideo ? ` format="${formatId}"` : ''}${entry.hasAudio ? ' audioSources="1" audioChannels="2" audioRate="48000"' : ''}>`
      + `<media-rep kind="original-media" src="${xmlAttr(fileUrl(options.rootUrl, entry.path))}"/></asset>`,
    );
  }
  const dissolve = timeline.transitions.length ? rid() : '';
  if (dissolve) resources.push(`<effect id="${dissolve}" name="Cross Dissolve" uid="${CROSS_DISSOLVE_UID}"/>`);

  // Sound of video clips: folded in when it plays the same file, otherwise connected separately.
  const clipsById = new Map<string, NleClip>();
  for (const track of [...timeline.videoTracks, ...timeline.audioTracks]) for (const clip of track.clips) clipsById.set(clip.id, clip);
  const foldedSound = new Map<string, NleClip>(); // video clip id → its sound
  const silencedVideo = new Set<string>();
  for (const track of timeline.audioTracks) {
    for (const clip of track.clips) {
      const video = clip.linkedTo ? clipsById.get(clip.linkedTo) : undefined;
      if (!video) continue;
      if (video.media === clip.media) foldedSound.set(video.id, clip);
      else silencedVideo.add(video.id);
    }
  }

  const retimedStart = (clip: NleClip) => (clip.speed === 1 ? secondsToFrames(clip.sourceInSec, fps) : Math.round(secondsToFrames(clip.sourceInSec, fps) / clip.speed));

  const volumeXml = (db: number | undefined, fadeInSec?: number, fadeOutSec?: number) => {
    const fades = (fadeInSec ? `<fadeIn type="easeIn" duration="${t(secondsToFrames(fadeInSec, fps))}"/>` : '')
      + (fadeOutSec ? `<fadeOut type="easeIn" duration="${t(secondsToFrames(fadeOutSec, fps))}"/>` : '');
    if ((db === undefined || db === 0) && !fades) return '';
    return `<adjust-volume amount="${round3(db ?? 0)}dB">${fades ? `<param name="amount">${fades}</param>` : ''}</adjust-volume>`;
  };

  /** One clip element; `lane` set for connected clips; `offset` in its parent's local time. */
  const clipXml = (clip: NleClip, offset: number, lane: number | undefined, children = ''): string => {
    const entry = media.get(clip.media)!;
    const ref = assetIds.get(entry.key)!;
    const isImage = entry.kind === 'image';
    const element = isImage ? 'video' : 'asset-clip';
    const start = isImage ? 0 : retimedStart(clip);
    const attrs = `ref="${ref}"${lane !== undefined ? ` lane="${lane}"` : ''} offset="${t(offset)}" name="${xmlAttr(clip.name)}" start="${t(start)}" duration="${t(clip.durationFrames)}"${clip.enabled ? '' : ' enabled="0"'}${isImage ? '' : ' tcFormat="NDF"'}`;
    const parts: string[] = [];
    if (clip.speed !== 1 && !isImage) {
      const mediaFrames = secondsToFrames(entry.durationSec, fps);
      parts.push(`<timeMap><timept time="0s" value="0s" interp="linear"/><timept time="${t(Math.round(mediaFrames / clip.speed))}" value="${t(mediaFrames)}" interp="linear"/></timeMap>`);
    }
    if (entry.hasVideo) {
      if (clip.placement) {
        const { scale, offsetX, offsetY } = clip.placement;
        parts.push('<adjust-conform type="none"/>');
        const position = offsetX || offsetY ? ` position="${round3((offsetX / H) * 100)} ${round3((-offsetY / H) * 100)}"` : '';
        if (position || scale !== 1) parts.push(`<adjust-transform${position} scale="${round6(scale)} ${round6(scale)}"/>`);
      } else {
        parts.push('<adjust-conform type="fill"/>');
      }
      if (clip.opacity !== undefined) parts.push(`<adjust-blend amount="${round3(clip.opacity)}"/>`);
    }
    if (entry.hasAudio) {
      const sound = entry.hasVideo ? foldedSound.get(clip.id) : clip;
      if (entry.hasVideo && (silencedVideo.has(clip.id) || (sound && !sound.enabled))) parts.push(`<adjust-volume amount="${SILENT_DB}dB"/>`);
      else if (sound) parts.push(volumeXml(sound.volumeDb, sound.fadeInSec, sound.fadeOutSec));
    }
    return `<${element} ${attrs}>${parts.join('')}${children}</${element}>`;
  };

  // The spine: main-track clips and the gaps between them, covering the whole timeline.
  const spine: SpineEntry[] = [];
  let cursor = 0;
  const mainClips = [...(timeline.videoTracks[0]?.clips ?? [])].sort((left, right) => left.startFrame - right.startFrame);
  for (const clip of mainClips) {
    if (clip.startFrame < cursor) continue; // overlapping main clips cannot share a storyline
    if (clip.startFrame > cursor) spine.push({ kind: 'gap', offset: cursor, duration: clip.startFrame - cursor, localStart: 0, anchored: [] });
    spine.push({ kind: 'clip', clip, offset: clip.startFrame, duration: clip.durationFrames, localStart: media.get(clip.media)?.kind === 'image' ? 0 : retimedStart(clip), anchored: [] });
    cursor = clip.startFrame + clip.durationFrames;
  }
  const end = Math.max(timeline.durationFrames, cursor, 1);
  if (cursor < end) spine.push({ kind: 'gap', offset: cursor, duration: end - cursor, localStart: 0, anchored: [] });

  const host = (frame: number): SpineEntry => spine.find((entry) => frame < entry.offset + entry.duration) ?? spine[spine.length - 1]!;
  const connect = (clip: NleClip, lane: number) => {
    const parent = host(clip.startFrame);
    parent.anchored.push(clipXml(clip, parent.localStart + (clip.startFrame - parent.offset), lane));
  };
  timeline.videoTracks.slice(1).forEach((track, index) => {
    for (const clip of track.clips) connect(clip, index + 1);
  });
  timeline.audioTracks.forEach((track, index) => {
    for (const clip of track.clips) {
      const video = clip.linkedTo ? clipsById.get(clip.linkedTo) : undefined;
      if (video && video.media === clip.media) continue; // folded into its video clip
      connect(clip, -(index + 1));
    }
  });

  const transitionsAfter = new Map(timeline.transitions.map((transition) => [transition.leftClipId, transition]));
  const spineXml = spine.map((entry) => {
    const children = entry.anchored.join('');
    const element = entry.kind === 'gap'
      ? `<gap name="Gap" offset="${t(entry.offset)}" start="0s" duration="${t(entry.duration)}">${children}</gap>`
      : clipXml(entry.clip!, entry.offset, undefined, children);
    const transition = entry.clip ? transitionsAfter.get(entry.clip.id) : undefined;
    const dissolveXml = transition
      ? `<transition name="Cross Dissolve" offset="${t(transition.cutFrame - transition.durationFrames / 2)}" duration="${t(transition.durationFrames)}"><filter-video ref="${dissolve}" name="Cross Dissolve"/></transition>`
      : '';
    return element + dissolveXml;
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n'
    + `<fcpxml version="1.9"><resources>${resources.filter(Boolean).join('')}</resources>`
    + `<library><event name="Pireel"><project name="${xmlAttr(timeline.name)}">`
    + `<sequence format="${sequenceFormat}" duration="${t(end)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>${spineXml}</spine></sequence>`
    + `</project></event></library></fcpxml>\n`;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

