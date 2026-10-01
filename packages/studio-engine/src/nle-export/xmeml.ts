/**
 * Final Cut Pro 7 XML (xmeml version 4): the interchange Premiere Pro and DaVinci Resolve import.
 *
 * Conventions follow Premiere's own exports: clipitem in/out are source frames and start/end
 * timeline frames, both at the sequence rate; a video clip and its sound are joined with <link>;
 * volume is the Audio Levels filter (linear gain, 1 = 0 dB); speed is the Time Remap filter;
 * dissolves and audio fades are transitionitems. Placement is the Basic Motion filter: scale in
 * percent of the native size, centre as an offset from the frame centre in fractions of the frame.
 */

import type { NleClip, NleMedia, NleTimeline, NleTrack } from './timeline';
import { fileUrl, secondsToFrames, timebaseOf, xmlText } from './xml';

export interface XmemlOptions {
  /** File URL of the unpacked package folder, ending with "/" (file:///Users/Shared/Pireel/name/). */
  rootUrl: string;
}

const MAX_LEVEL = 3.98109; // +12 dB, the top of the Audio Levels range

export function toXmeml(timeline: NleTimeline, options: XmemlOptions): string {
  const { fps, width: W, height: H } = timeline;
  const tb = timebaseOf(fps);
  const rate = `<rate><timebase>${tb.timebase}</timebase><ntsc>${tb.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  const media = new Map(timeline.media.map((entry) => [entry.key, entry]));
  const fileIds = new Map<string, string>();
  const written = new Set<string>();
  timeline.media.forEach((entry, index) => fileIds.set(entry.key, `file-${index + 1}`));
  const masterIds = new Map(timeline.media.map((entry, index) => [entry.key, `masterclip-${index + 1}`]));

  // Stills have no length of their own: give each image file the longest span it is used for.
  const imageFrames = new Map<string, number>();
  for (const track of timeline.videoTracks) {
    for (const clip of track.clips) {
      if (media.get(clip.media)?.kind === 'image') imageFrames.set(clip.media, Math.max(imageFrames.get(clip.media) ?? 0, clip.durationFrames));
    }
  }
  const fileFrames = (entry: NleMedia) => entry.kind === 'image'
    ? Math.max(1, imageFrames.get(entry.key) ?? 1)
    : Math.max(1, secondsToFrames(entry.durationSec, fps));

  const fileXml = (entry: NleMedia): string => {
    const id = fileIds.get(entry.key)!;
    if (written.has(entry.key)) return `<file id="${id}"/>`;
    written.add(entry.key);
    const video = entry.hasVideo
      ? `<video><samplecharacteristics>${rate}${entry.width ? `<width>${entry.width}</width>` : ''}${entry.height ? `<height>${entry.height}</height>` : ''}<anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>`
      : '';
    const audio = entry.hasAudio
      ? '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>'
      : '';
    return `<file id="${id}"><name>${xmlText(entry.path.split('/').pop() ?? entry.name)}</name><pathurl>${xmlText(fileUrl(options.rootUrl, entry.path))}</pathurl>${rate}<duration>${fileFrames(entry)}</duration><media>${video}${audio}</media></file>`;
  };

  // Item ids and positions first: links name their partner's track and index.
  const itemId = new Map<string, string>();
  const position = new Map<string, { type: 'video' | 'audio'; track: number; index: number }>();
  let counter = 0;
  const layout = (tracks: NleTrack[], type: 'video' | 'audio') => tracks.map((track, trackIndex) => {
    const items = itemsOf(track, type);
    let index = 0;
    for (const item of items) {
      index += 1;
      if (item.kind === 'clip') {
        counter += 1;
        itemId.set(item.clip.id, `clipitem-${counter}`);
        position.set(item.clip.id, { type, track: trackIndex + 1, index });
      }
    }
    return items;
  });

  type Item = { kind: 'clip'; clip: NleClip } | { kind: 'transition'; startFrame: number; endFrame: number; alignment: 'center' | 'start-black' | 'end-black'; audio: boolean };
  function itemsOf(track: NleTrack, type: 'video' | 'audio'): Item[] {
    const clips = [...track.clips].sort((left, right) => left.startFrame - right.startFrame);
    const items: Item[] = [];
    clips.forEach((clip, index) => {
      if (type === 'audio') {
        const previous = clips[index - 1];
        const abutsPrevious = !!previous && previous.startFrame + previous.durationFrames === clip.startFrame;
        const fadeIn = Math.min(secondsToFrames(clip.fadeInSec ?? 0, fps), clip.durationFrames);
        if (fadeIn > 0 && !abutsPrevious) items.push({ kind: 'transition', startFrame: clip.startFrame, endFrame: clip.startFrame + fadeIn, alignment: 'start-black', audio: true });
      }
      items.push({ kind: 'clip', clip });
      if (type === 'audio') {
        const next = clips[index + 1];
        const end = clip.startFrame + clip.durationFrames;
        const abutsNext = !!next && next.startFrame === end;
        const fadeOut = Math.min(secondsToFrames(clip.fadeOutSec ?? 0, fps), clip.durationFrames);
        if (fadeOut > 0 && !abutsNext) items.push({ kind: 'transition', startFrame: end - fadeOut, endFrame: end, alignment: 'end-black', audio: true });
      }
    });
    return items;
  }

  // Dissolves sit between their two clips on the main video track.
  const videoLayouts = layout(timeline.videoTracks, 'video');
  const audioLayouts = layout(timeline.audioTracks, 'audio');
  const mainItems = videoLayouts[0] ?? [];
  for (const transition of [...timeline.transitions].reverse()) {
    const at = mainItems.findIndex((item) => item.kind === 'clip' && item.clip.id === transition.leftClipId);
    if (at < 0) continue;
    const half = transition.durationFrames / 2;
    mainItems.splice(at + 1, 0, { kind: 'transition', startFrame: transition.cutFrame - half, endFrame: transition.cutFrame + half, alignment: 'center', audio: false });
  }
  // Re-index the main track now that dissolves sit between its clips.
  let mainIndex = 0;
  for (const item of mainItems) {
    mainIndex += 1;
    if (item.kind === 'clip') position.set(item.clip.id, { type: 'video', track: 1, index: mainIndex });
  }

  const linkXml = (clipId: string): string => {
    const id = itemId.get(clipId);
    const where = position.get(clipId);
    if (!id || !where) return '';
    return `<link><linkclipref>${id}</linkclipref><mediatype>${where.type}</mediatype><trackindex>${where.track}</trackindex><clipindex>${where.index}</clipindex>${where.type === 'audio' ? '<groupindex>1</groupindex>' : ''}</link>`;
  };

  const effect = (name: string, id: string, category: string, mediatype: 'video' | 'audio', parameters: string) =>
    `<filter><effect><name>${name}</name><effectid>${id}</effectid><effectcategory>${category}</effectcategory><effecttype>${category === 'audiolevels' ? 'audiolevels' : 'motion'}</effecttype><mediatype>${mediatype}</mediatype>${parameters}</effect></filter>`;

  const clipXml = (clip: NleClip, type: 'video' | 'audio'): string => {
    const entry = media.get(clip.media)!;
    const isImage = entry.kind === 'image';
    const inFrame = isImage ? 0 : secondsToFrames(clip.sourceInSec, fps);
    const outFrame = inFrame + (isImage ? clip.durationFrames : Math.max(1, Math.round(clip.durationFrames * clip.speed)));
    const filters: string[] = [];
    if (clip.speed !== 1 && !isImage) {
      filters.push(effect('Time Remap', 'timeremap', 'motion', type,
        '<parameter><parameterid>variablespeed</parameterid><name>variablespeed</name><valuemin>0</valuemin><valuemax>1</valuemax><value>0</value></parameter>'
        + `<parameter><parameterid>speed</parameterid><name>speed</name><valuemin>-100000</valuemin><valuemax>100000</valuemax><value>${Math.round(clip.speed * 10000) / 100}</value></parameter>`
        + '<parameter><parameterid>reverse</parameterid><name>reverse</name><value>FALSE</value></parameter>'
        + '<parameter><parameterid>frameblending</parameterid><name>frameblending</name><value>FALSE</value></parameter>'));
    }
    if (type === 'video' && clip.placement) {
      const { scale, offsetX, offsetY } = clip.placement;
      const center = offsetX || offsetY
        ? `<parameter><parameterid>center</parameterid><name>Center</name><value><horiz>${round6(offsetX / W)}</horiz><vert>${round6(offsetY / H)}</vert></value></parameter>`
        : '';
      filters.push(effect('Basic Motion', 'basic', 'motion', 'video',
        `<parameter><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>${round6(scale * 100)}</value></parameter>${center}`));
    }
    if (type === 'video' && clip.opacity !== undefined) {
      filters.push(effect('Opacity', 'opacity', 'motion', 'video',
        `<parameter><parameterid>opacity</parameterid><name>opacity</name><valuemin>0</valuemin><valuemax>100</valuemax><value>${round6(clip.opacity * 100)}</value></parameter>`));
    }
    if (type === 'audio' && clip.volumeDb !== undefined && clip.volumeDb !== 0) {
      const level = Math.min(MAX_LEVEL, Math.pow(10, clip.volumeDb / 20));
      filters.push(effect('Audio Levels', 'audiolevels', 'audiolevels', 'audio',
        `<parameter><parameterid>level</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>${MAX_LEVEL}</valuemax><value>${round6(level)}</value></parameter>`));
    }
    const links = clip.linkedTo ? `${linkXml(clip.id)}${linkXml(clip.linkedTo)}` : '';
    return `<clipitem id="${itemId.get(clip.id)}"><masterclipid>${masterIds.get(clip.media)}</masterclipid><name>${xmlText(clip.name)}</name><enabled>${clip.enabled ? 'TRUE' : 'FALSE'}</enabled><duration>${fileFrames(entry)}</duration>${rate}<start>${clip.startFrame}</start><end>${clip.startFrame + clip.durationFrames}</end><in>${inFrame}</in><out>${outFrame}</out><alphatype>${entry.alpha ? 'straight' : 'none'}</alphatype>${fileXml(entry)}<sourcetrack><mediatype>${type}</mediatype><trackindex>1</trackindex></sourcetrack>${filters.join('')}${links}</clipitem>`;
  };

  const transitionXml = (item: Extract<Item, { kind: 'transition' }>): string => {
    const effectXml = item.audio
      ? '<effect><name>Cross Fade (+3dB)</name><effectid>KGAudioTransCrossFade3dB</effectid><effectcategory>Dissolve</effectcategory><effecttype>transition</effecttype><mediatype>audio</mediatype></effect>'
      : '<effect><name>Cross Dissolve</name><effectid>Cross Dissolve</effectid><effectcategory>Dissolve</effectcategory><effecttype>transition</effecttype><mediatype>video</mediatype><wipecode>0</wipecode><wipeaccuracy>100</wipeaccuracy><startratio>0</startratio><endratio>1</endratio><reverse>FALSE</reverse></effect>';
    return `<transitionitem>${rate}<start>${item.startFrame}</start><end>${item.endFrame}</end><alignment>${item.alignment}</alignment>${effectXml}</transitionitem>`;
  };

  const trackXml = (items: Item[], type: 'video' | 'audio') =>
    `<track>${items.map((item) => (item.kind === 'clip' ? clipXml(item.clip, type) : transitionXml(item))).join('')}<enabled>TRUE</enabled><locked>FALSE</locked></track>`;

  const format = `<format><samplecharacteristics>${rate}<width>${W}</width><height>${H}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n'
    + `<xmeml version="4"><sequence id="sequence-1"><name>${xmlText(timeline.name)}</name><duration>${timeline.durationFrames}</duration>${rate}`
    + `<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>`
    + `<media><video>${format}${videoLayouts.map((items) => trackXml(items, 'video')).join('')}</video>`
    + `<audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>${audioLayouts.map((items) => trackXml(items, 'audio')).join('')}</audio></media>`
    + `</sequence></xmeml>\n`;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

