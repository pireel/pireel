/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '../agent-timeline';
import { emptyEditorDocumentV2 } from '../editor-document';
import type { EditorDocumentV2 } from '../editor-document/types';
import { buildNleTimeline, toFcpxml, toSrt, toXmeml, type NleTimeline } from './index';

const card = "function (props, ctx) { return { html: '<b>' + props.title + '</b>', animate: function (tl, el) { tl.from(el, { opacity: 0, duration: 0.3 }, 0); } }; }";

function project(): EditorDocumentV2 {
  let document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  const step = (tool: string, input: Record<string, unknown>) => {
    const result = runAgentTimelineTool(document, tool, input);
    expect(result.ok, `${tool}: ${JSON.stringify(result)}`).toBe(true);
    document = result.document!;
    return result;
  };
  step('register_media', { assets: [
    { id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 12, width: 1080, height: 1920, hasAudio: true, label: '口播 A' },
    { id: 'street', kind: 'video', url: 'https://cdn.example/street.mp4', durationSec: 8, width: 1920, height: 1080, hasAudio: true },
    { id: 'song', kind: 'audio', url: 'https://cdn.example/song.mp3', durationSec: 30 },
  ] });
  step('add_clips', { clips: [
    { id: 'a', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 150, source: [0, 5] },
    { id: 'b', assetId: 'cam', role: 'primary', startFrame: 150, durationFrames: 120, source: [6, 10] },
  ] });
  step('add_clips', { clips: [
    { id: 'pip', assetId: 'street', role: 'broll', startFrame: 30, durationFrames: 60, source: [1, 3], box: { x: 0.55, y: 0.05, w: 0.4, h: 0.3 } },
    { id: 'bed', assetId: 'song', role: 'music', startFrame: 0, durationFrames: 270, source: [0, 9] },
  ] });
  step('set_look', { look: { css: '', pieces: [{ id: 'title', label: 'Title', source: card }] } });
  step('place_graphics', { items: [{ id: 'g1', pieceId: 'title', props: [{ key: 'title', value: 'Hi' }], startFrame: 200, durationFrames: 45 }] });
  step('add_transition', { atFrame: 140, durationFrames: 20, effect: 'fade' });
  return document;
}

function timeline(): NleTimeline {
  return buildNleTimeline(project(), {
    name: '测试 & 导出',
    mediaFile: (asset) => ({ path: `media/${asset.id}.${asset.kind === 'audio' ? 'mp3' : 'mp4'}` }),
    graphicFile: (clipId) => `graphics/${clipId}.mov`,
  });
}

const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
};

describe('NLE timeline projection', () => {
  it('keeps cuts, tracks, placement, sound, dissolves and graphics, and names what it cannot carry', () => {
    const tl = timeline();
    expect(tl).toMatchObject({ width: 1080, height: 1920, fps: 30, durationFrames: 270 });
    expect(tl.videoTracks.map((track) => track.name)).toEqual(['Main', 'B-roll', 'Graphics']);
    expect(tl.videoTracks[0]!.clips.map(({ id, startFrame, durationFrames, sourceInSec, speed }) => ({ id, startFrame, durationFrames, sourceInSec, speed })))
      .toEqual([
        { id: 'a', startFrame: 0, durationFrames: 150, sourceInSec: 0, speed: 1 },
        { id: 'b', startFrame: 150, durationFrames: 120, sourceInSec: 6, speed: 1 },
      ]);
    // A 16:9 clip covering a 432×576 window, its centre 270 px right and 576 px up of the frame centre.
    expect(tl.videoTracks[1]!.clips[0]!.placement).toEqual({ scale: 0.533, offsetX: 270, offsetY: -576 });
    expect(tl.videoTracks[2]!.clips[0]).toMatchObject({ media: 'graphic:g1', startFrame: 200, durationFrames: 45 });
    expect(tl.media.find((entry) => entry.key === 'graphic:g1')).toMatchObject({ path: 'graphics/g1.mov', alpha: true, hasAudio: false });
    // The main track's own sound is linked; B-roll arrives silent; music keeps its level and role fades.
    expect(tl.audioTracks.map((track) => track.name)).toEqual(['Main audio', 'B-roll audio', 'Music']);
    expect(tl.audioTracks[0]!.clips[0]).toMatchObject({ id: 'a-audio', linkedTo: 'a', enabled: true, volumeDb: 0 });
    expect(tl.videoTracks[0]!.clips[0]!.linkedTo).toBe('a-audio');
    expect(tl.audioTracks[1]!.clips[0]!.enabled).toBe(false);
    expect(tl.audioTracks[2]!.clips[0]).toMatchObject({ volumeDb: -24, fadeInSec: 0.8, fadeOutSec: 1.5 });
    expect(tl.transitions).toEqual([{ cutFrame: 150, durationFrames: 20, leftClipId: 'a', rightClipId: 'b' }]);
    expect(tl.notes.map((note) => note.code)).toContain('window-crop');
  });

  it('drops a dissolve when the clips have no footage around the cut, and says so', () => {
    let document = project();
    // The first clip now runs to the end of its source: nothing left after its out point.
    document = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === 'a' && clip.kind === 'narrative' ? { ...clip, sourceInSec: 7, sourceOutSec: 12 } : clip)),
    })) } };
    const tl = buildNleTimeline(document, { name: 'x', mediaFile: (asset) => ({ path: `media/${asset.id}` }), graphicFile: () => null });
    expect(tl.transitions).toEqual([]);
    expect(tl.notes.map((note) => note.code)).toEqual(expect.arrayContaining(['transition-no-handles', 'graphic-missing']));
  });
});

describe('xmeml (Premiere Pro, DaVinci Resolve)', () => {
  it('writes clipitems with source and timeline frames, linked sound, levels, motion and a centred dissolve', () => {
    const xml = toXmeml(timeline(), { rootUrl: 'file:///Users/Shared/Pireel/%E6%B5%8B%E8%AF%95/' });
    const doc = parse(xml);
    expect(doc.querySelector('sequence > name')!.textContent).toBe('测试 & 导出');
    expect(doc.querySelector('sequence > duration')!.textContent).toBe('270');
    const videoTracks = doc.querySelectorAll('media > video > track');
    expect(videoTracks).toHaveLength(3);
    const main = [...videoTracks[0]!.children].filter((element) => element.tagName !== 'enabled' && element.tagName !== 'locked');
    expect(main.map((element) => element.tagName)).toEqual(['clipitem', 'transitionitem', 'clipitem']);
    const [a, dissolve, b] = main;
    expect(['start', 'end', 'in', 'out'].map((tag) => a!.querySelector(`:scope > ${tag}`)!.textContent)).toEqual(['0', '150', '0', '150']);
    expect(['start', 'end', 'in', 'out'].map((tag) => b!.querySelector(`:scope > ${tag}`)!.textContent)).toEqual(['150', '270', '180', '300']);
    expect(['start', 'end', 'alignment'].map((tag) => dissolve!.querySelector(`:scope > ${tag}`)!.textContent)).toEqual(['140', '160', 'center']);
    // The full file is written once; later uses reference it by id.
    expect(a!.querySelector('file > pathurl')!.textContent).toBe('file:///Users/Shared/Pireel/%E6%B5%8B%E8%AF%95/media/cam.mp4');
    expect(b!.querySelector('file')!.children).toHaveLength(0);
    expect([...a!.querySelectorAll(':scope > link > mediatype')].map((element) => element.textContent)).toEqual(['video', 'audio']);
    const pip = videoTracks[1]!.querySelector('clipitem')!;
    expect(pip.querySelector('effectid')!.textContent).toBe('basic');
    expect([...pip.querySelectorAll('parameter value')].map((element) => element.textContent)).toEqual(['53.3', '0.25-0.3']);
    expect(videoTracks[2]!.querySelector('alphatype')!.textContent).toBe('straight');
    const audioTracks = doc.querySelectorAll('media > audio > track');
    expect(audioTracks).toHaveLength(3);
    const music = audioTracks[2]!;
    expect(music.querySelector('effectid')!.textContent).toBe('KGAudioTransCrossFade3dB');
    expect(music.querySelector('parameter value')!.textContent).toBe('0.063096');
    expect([...music.querySelectorAll('transitionitem alignment')].map((element) => element.textContent)).toEqual(['start-black', 'end-black']);
    expect(audioTracks[1]!.querySelector('clipitem > enabled')!.textContent).toBe('FALSE');
  });
});

describe('FCPXML (Final Cut Pro, DaVinci Resolve)', () => {
  it('puts the main track in the spine and connects the rest to the clip under each start', () => {
    const doc = parse(toFcpxml(timeline(), { rootUrl: 'file:///Users/Shared/Pireel/x/' }));
    expect(doc.documentElement.getAttribute('version')).toBe('1.9');
    const spine = doc.querySelector('spine')!;
    expect([...spine.children].map((element) => element.tagName)).toEqual(['asset-clip', 'transition', 'asset-clip']);
    const [a, dissolve, b] = [...spine.children];
    expect(['offset', 'start', 'duration'].map((name) => a!.getAttribute(name))).toEqual(['0s', '0s', '150/30s']);
    expect(['offset', 'start', 'duration'].map((name) => b!.getAttribute(name))).toEqual(['150/30s', '180/30s', '120/30s']);
    expect(['offset', 'duration'].map((name) => dissolve!.getAttribute(name))).toEqual(['140/30s', '20/30s']);
    // Connected to the first clip, in its local time: B-roll above, music below, graphic on the second clip.
    const pip = a!.querySelector('asset-clip[lane="1"]')!;
    expect(pip.getAttribute('offset')).toBe('30/30s');
    expect(pip.querySelector('adjust-transform')!.getAttribute('position')).toBe('14.063 30');
    expect(pip.querySelector('adjust-volume')!.getAttribute('amount')).toBe('-96dB');
    const music = a!.querySelector('asset-clip[lane="-3"]')!;
    expect(music.querySelector('adjust-volume')!.getAttribute('amount')).toBe('-24dB');
    expect(music.querySelector('fadeIn')!.getAttribute('duration')).toBe('24/30s');
    const graphic = b!.querySelector('asset-clip[lane="2"]')!;
    expect(graphic.getAttribute('offset')).toBe('230/30s');
    // The main clips' own sound is folded into them, not repeated as connected clips.
    expect(doc.querySelectorAll('asset-clip[lane="-1"]')).toHaveLength(0);
    expect(doc.querySelectorAll('media-rep')).toHaveLength(4);
  });
});

describe('subtitles', () => {
  it('writes SubRip cues in time order, skipping empty ones', () => {
    expect(toSrt([
      { startSec: 3.5, endSec: 5, text: '第二句' },
      { startSec: 0, endSec: 1.25, text: '第一句' },
      { startSec: 6, endSec: 7, text: '  ' },
    ])).toBe('1\n00:00:00,000 --> 00:00:01,250\n第一句\n\n2\n00:00:03,500 --> 00:00:05,000\n第二句\n');
  });
});

describe('names', () => {
  it('shows a person-readable name, never a content fingerprint', async () => {
    const { nleAssetName } = await import('./timeline');
    const asset = (label?: string) => ({ id: 'a', kind: 'video' as const, locator: {}, metadata: {}, ...(label ? { label } : {}) });
    expect(nleAssetName(asset('口播 A'), 'x')).toBe('口播 A');
    expect(nleAssetName(asset('pireel2:510e80571914c16b75626f0027bb919d:5021665'), '01-video.mp4')).toBe('01-video.mp4');
    expect(nleAssetName(asset(), '01-video.mp4')).toBe('01-video.mp4');
  });
});
