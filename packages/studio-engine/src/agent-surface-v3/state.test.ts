import { describe, expect, it } from 'vitest';
import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../editor-document/types';
import { documentDelta, renderV3State } from './state';

const track = (id: string, type: EditorTrack['type'], clips: TimelineClip[], extra: Partial<EditorTrack> = {}): EditorTrack => ({
  id, type, muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 0, clips, ...extra,
});
const narrative = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}): TimelineClip => ({
  id, kind: 'narrative', startFrame: start, durationFrames: duration, enabled: true, assetId: 'a1', sourceInSec: 0, sourceOutSec: duration / 30,
  properties: { treatment: 'full', speed: 1 } as never, ...extra,
} as TimelineClip);
const graphic = (id: string, start: number, duration: number): TimelineClip => ({
  id, kind: 'graphic', startFrame: start, durationFrames: duration, enabled: true, anchor: { type: 'timeline' },
  block: { templateId: 'kit.number', slots: {}, box: { x: 0.1, y: 0.6, w: 0.5, h: 0.2 } } as never,
} as TimelineClip);
const audio = (id: string, start: number, duration: number, extra: Record<string, unknown> = {}): TimelineClip => ({
  id, kind: 'audio', startFrame: start, durationFrames: duration, enabled: true, assetId: 'a9', sourceInSec: 0, anchor: { type: 'timeline' },
  properties: { volumeDb: -14, fadeInSec: 1.5 } as never, ...extra,
} as TimelineClip);
const caption = (id: string, start: number, duration: number, text: string): TimelineClip => ({
  id, kind: 'caption', startFrame: start, durationFrames: duration, enabled: true, managed: true, anchor: { type: 'timeline' },
  block: { templateId: 'caption', slots: { text } } as never,
} as TimelineClip);

function doc(tracks: EditorTrack[]): EditorDocumentV2 {
  return {
    version: 2 as never,
    canvas: { width: 1080, height: 1920, fps: 30 } as never,
    appearance: { frameId: 'editorial-mono' } as never,
    assets: { a1: { id: 'a1', kind: 'video', label: 'talk.mp4', locator: {} as never, metadata: { durationSec: 118.4, hasAudio: true } }, a9: { id: 'a9', kind: 'audio', locator: {} as never, metadata: {} } },
    timeline: { tracks },
    semantics: { primaryNarrativeTrackId: 't1', managedCaptionTrackId: 't6', transcripts: {}, scenes: [] },
  };
}

describe('renderV3State', () => {
  it('renders frames, omits defaults, folds linked audio and collapses captions', () => {
    const document = doc([
      track('t1', 'visual', [narrative('c1', 0, 1500, { linkGroupId: 'lg1' }), narrative('c2', 1500, 1212, { properties: { treatment: 'punch-in', speed: 1 } })], { role: 'primaryNarrative' }),
      track('t3', 'graphics', [graphic('g1', 600, 120)], { stackOrder: 30, role: 'graphics' }),
      track('t5', 'audio', [audio('c1a', 0, 1500, { linkGroupId: 'lg1', properties: { volumeDb: -3 } }), audio('m1', 0, 2712)], { role: 'music' }),
      track('t6', 'caption', [caption('k1', 0, 60, 'So today'), caption('k2', 60, 60, 'we start')], { role: 'managedCaptions', stackOrder: 40 }),
    ]);
    const state = renderV3State(document);
    expect(state.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(state.durationFrames).toBe(2712);
    expect(state.frame).toEqual({ id: 'editorial-mono' });
    const t1 = state.tracks.find((t) => t.id === 't1')!;
    expect(t1.clips![0]).toMatchObject({ id: 'c1', kind: 'narrative', frames: [0, 1500], source: [0, 50], audio: { clipId: 'c1a', volumeDb: -3 } });
    expect(t1.clips![0]).not.toHaveProperty('treatment');
    expect(t1.clips![1]).toMatchObject({ frames: [1500, 2712], treatment: 'punch-in' });
    expect(t1.clips![1]).not.toHaveProperty('speed');
    expect(t1).not.toHaveProperty('gaps');
    const t5 = state.tracks.find((t) => t.id === 't5')!;
    expect(t5.linkedClips).toBe(1);
    expect(t5.clips!.map((c) => c.id)).toEqual(['m1']);
    expect(t5.clips![0]).toMatchObject({ volumeDb: -14, fadeInSec: 1.5 });
    const t6 = state.tracks.find((t) => t.id === 't6')!;
    expect(t6.captions).toMatchObject({ on: true, cueCount: 2, preview: 'So today … we start' });
    expect(t6).not.toHaveProperty('clips');
    expect(state.tracks.find((t) => t.id === 't3')!.clips![0]).toMatchObject({ kind: 'graphic', component: { componentId: 'kit.number', box: { x: 0.1, y: 0.6, w: 0.5, h: 0.2 } } });
    expect(state.assets[0]).toEqual({ id: 'a1', kind: 'video', label: 'talk.mp4', durationSec: 118.4, hasAudio: true });
  });

  it('omits identity geometry and keeps a real crop or subject framing', () => {
    const identity = narrative('c1', 0, 300, {
      mediaFraming: { crop: { top: 0, left: 0, right: 0, bottom: 0 }, rounding: 0, transform: { scale: 1, offsetX: 0, offsetY: 0 } },
      properties: { treatment: 'full', speed: 1, preciseFraming: { scale: 1, anchorX: 0.5, anchorY: 0.5, coordinateSpace: 'source-normalized' } },
    });
    const framed = narrative('c2', 300, 300, {
      mediaFraming: { crop: { top: 0.1, left: 0, right: 0, bottom: 0 }, rounding: 0, transform: { scale: 1, offsetX: 0, offsetY: 0 } },
      properties: { treatment: 'full', speed: 1, preciseFraming: { scale: 1.3, anchorX: 0.5, anchorY: 0.4, coordinateSpace: 'source-normalized' } },
    });
    const state = renderV3State(doc([track('t1', 'visual', [identity, framed], { role: 'primaryNarrative' })]));
    expect(state.tracks[0]!.clips![0]).not.toHaveProperty('framing');
    expect(state.tracks[0]!.clips![0]).not.toHaveProperty('preciseFraming');
    expect(state.tracks[0]!.clips![1]).toMatchObject({ framing: { crop: { top: 0.1 } }, preciseFraming: { scale: 1.3 } });
  });

  it('flags library media that is not placed on any track', () => {
    const document = doc([track('t1', 'visual', [narrative('c1', 0, 300)], { role: 'primaryNarrative' })]);
    document.assets.lib1 = { id: 'lib1', kind: 'video', label: 'raw.mov', locator: {} as never, metadata: {}, library: { createdAt: 1 } } as never;
    const state = renderV3State(document);
    expect(state.assets.find((asset) => asset.id === 'a1')).not.toHaveProperty('library');
    expect(state.assets.find((asset) => asset.id === 'lib1')).toMatchObject({ kind: 'video', label: 'raw.mov', library: true });
  });

  it('windows tracks and frames and reports totalClips when truncated', () => {
    const document = doc([
      track('t1', 'visual', [narrative('c1', 0, 300), narrative('c2', 300, 300), narrative('c3', 600, 300)], { role: 'primaryNarrative' }),
      track('t3', 'graphics', [graphic('g1', 0, 60)]),
    ]);
    const state = renderV3State(document, { window: { tracks: ['t1'], fromFrame: 300, toFrame: 600 } });
    expect(state.tracks.map((t) => t.id)).toEqual(['t1']);
    expect(state.tracks[0]!.clips!.map((c) => c.id)).toEqual(['c2']);
    expect(state.tracks[0]!.totalClips).toBe(3);
  });

  it('reports gaps in frames', () => {
    const state = renderV3State(doc([track('t2', 'visual', [narrative('b1', 900, 120), narrative('b2', 1200, 60)], { role: 'broll' })]));
    expect(state.tracks[0]!.gaps).toEqual([[0, 900], [1020, 1200]]);
  });
});

describe('documentDelta', () => {
  const base = () => doc([
    track('t1', 'visual', [narrative('c1', 0, 600), narrative('c2', 600, 600), narrative('c3', 1200, 600)], { role: 'primaryNarrative' }),
    track('t3', 'graphics', [graphic('g1', 700, 120), graphic('g2', 900, 120), graphic('g3', 1300, 120), graphic('g4', 1500, 120)], { role: 'graphics' }),
    track('t6', 'caption', [caption('k1', 0, 60, 'a'), caption('k2', 60, 60, 'b')], { role: 'managedCaptions' }),
  ]);

  it('returns null when nothing changed', () => {
    expect(documentDelta(base(), base())).toBeNull();
  });

  it('compresses uniform shifts of three or more clips into a rule and enumerates smaller groups', () => {
    const before = base();
    const after = base();
    // cut 300 frames out of c1: c2/c3 and every graphic shift earlier
    after.timeline.tracks[0]!.clips = [narrative('c1', 0, 300), narrative('c2', 300, 600), narrative('c3', 900, 600)];
    after.timeline.tracks[1]!.clips = [graphic('g1', 400, 120), graphic('g2', 600, 120), graphic('g3', 1000, 120), graphic('g4', 1200, 120)];
    after.timeline.tracks[2]!.clips = [caption('k9', 0, 60, 'a'), caption('k10', 60, 60, 'b')];
    const delta = documentDelta(before, after)!;
    expect(delta.durationFrames).toEqual([1800, 1500]);
    expect(delta.shifted).toEqual([{ trackId: 't3', fromFrame: 700, byFrames: -300, count: 4 }]);
    // c1 changed content (duration); c2 and c3 form a 2-clip shift group → enumerated in clips
    expect(delta.clips!.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(delta.clips![0]!.frames).toEqual([0, 300]);
    expect(delta.captions).toEqual({ cueCount: 2, change: 'relaid' });
    expect(delta.notes).toEqual(['Caption cues were re-derived; never address individual cues.']);
    expect(delta).not.toHaveProperty('removedClipIds');
  });

  it('reports removed clips, created tracks and caps the clip list', () => {
    const before = base();
    const after = base();
    after.timeline.tracks[1]!.clips = after.timeline.tracks[1]!.clips.filter((c) => c.id !== 'g2');
    after.timeline.tracks.push(track('t7', 'audio', Array.from({ length: 35 }, (_, i) => audio(`s${i}`, i * 30, 15)), { role: 'sfx' }));
    const delta = documentDelta(before, after)!;
    expect(delta.removedClipIds).toEqual(['g2']);
    expect(delta.createdTracks).toEqual([{ id: 't7', type: 'audio', role: 'sfx', order: 0 }]);
    expect(delta.clips).toHaveLength(30);
    expect(delta.notes).toEqual(expect.arrayContaining([
      'Showing 30 of 35 changed clips — re-read get_state for the rest.',
      expect.stringContaining('Track set changed'),
    ]));
  });

  it('reports the source spans that left the timeline so they can be re-inserted forward', () => {
    const before = base();
    const after = base();
    // c1 trimmed at the head (source 0–5s → 2–5s), c3 removed entirely
    after.timeline.tracks[0]!.clips = [narrative('c1', 0, 540, { sourceInSec: 2, sourceOutSec: 20 }), narrative('c2', 540, 600)];
    const delta = documentDelta(before, after)!;
    expect(delta.removedClipIds).toEqual(['c3']);
    expect(delta.removedSource).toEqual([
      { clipId: 'c1', assetId: 'a1', source: [0, 2], fromFrame: 0 },
      { clipId: 'c3', assetId: 'a1', source: [0, 20], fromFrame: 1200 },
    ]);
  });

  it('describes caption layer removal and restyle without enumerating cues', () => {
    const before = base();
    const removed = base();
    removed.timeline.tracks[2]!.clips = [];
    expect(documentDelta(before, removed)!.captions).toEqual({ cueCount: 0, change: 'removed' });
    const restyled = base();
    restyled.timeline.tracks[2]!.clips = [caption('k1', 0, 60, 'a'), caption('k2', 60, 60, 'b')].map((c) => ({ ...c, block: { ...(c as { block: object }).block, style: 'bold' } } as unknown as TimelineClip));
    const delta = documentDelta(before, restyled)!;
    expect(delta.captions).toEqual({ cueCount: 2, change: 'restyled' });
    expect(delta).not.toHaveProperty('clips');
  });
});
