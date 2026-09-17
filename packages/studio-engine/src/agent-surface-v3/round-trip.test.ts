import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '../agent-timeline';
import { emptyEditorDocumentV2, listDocumentAddressedWords } from '../editor-document';
import type { EditorDocumentV2, EditorTrack, TimelineClip } from '../editor-document/types';
import { documentDelta, renderV3State, type V3ClipView, type V3Delta, type V3StateView } from './state';

/**
 * Round-trip contract: a value written through a v3 tool lands in the document, reads back from
 * get_state under the name and unit it was written with, and the mutation delta reports the clip
 * that carries it. One case per field a tool declares, so a field that is accepted but never shown
 * again (a fade that did not echo, a lane that was not named, a shift with the wrong sign) fails here.
 */

function project(): EditorDocumentV2 {
  let document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document = runAgentTimelineTool(document, 'register_media', { assets: [
    { id: 'cam', kind: 'video', url: 'https://cdn.example/cam.mp4', durationSec: 20, width: 1080, height: 1920, hasAudio: true },
    { id: 'cam2', kind: 'video', url: 'https://cdn.example/cam2.mp4', durationSec: 20, width: 1080, height: 1920, hasAudio: true },
    { id: 'still', kind: 'image', url: 'https://cdn.example/still.jpg', width: 1080, height: 1920 },
    { id: 'music', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 60 },
  ] }).document!;
  const placed = runAgentTimelineTool(document, 'add_clips', { clips: [
    { id: 'spine-a', assetId: 'cam', role: 'primary', startFrame: 0, durationFrames: 300 },
    { id: 'spine-b', assetId: 'cam', role: 'primary', startFrame: 300, durationFrames: 300, source: [10, 20] },
    { id: 'broll', assetId: 'cam2', role: 'broll', startFrame: 60, durationFrames: 90 },
    { id: 'still-clip', assetId: 'still', role: 'broll', startFrame: 200, durationFrames: 60 },
    { id: 'bed', assetId: 'music', role: 'music', startFrame: 0, durationFrames: 600 },
  ] });
  expect(placed.ok, JSON.stringify(placed)).toBe(true);
  document = placed.document!;
  const title: TimelineClip = {
    id: 'title', kind: 'graphic', startFrame: 30, durationFrames: 60, enabled: true, anchor: { type: 'timeline' },
    block: { templateId: 'custom', slots: { innerHtml: '<div>hi</div>', timelineBody: '' }, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 } },
  } as unknown as TimelineClip;
  document.timeline.tracks.push({ id: 'gfx', type: 'graphics', role: 'graphics', name: 'Graphics', stackOrder: 20, muted: false, hidden: false, locked: false, syncLocked: false, clips: [title] } as unknown as EditorTrack);
  return document;
}

interface Trip { ok: boolean; data?: unknown; state: V3StateView; delta: V3Delta | null; clip: (id: string) => V3ClipView | undefined; touched: (id: string) => V3ClipView | undefined; document: EditorDocumentV2 }

function trip(document: EditorDocumentV2, tool: string, args: Record<string, unknown>): Trip {
  const result = runAgentTimelineTool(document, tool, args);
  if (!result.ok) throw new Error(`${tool} refused: ${JSON.stringify(result)}`);
  const after = result.document!;
  const state = renderV3State(after);
  const delta = documentDelta(document, after);
  const all = state.tracks.flatMap((track) => track.clips ?? []);
  return {
    ok: result.ok, data: result.data, state, delta, document: after,
    clip: (id) => all.find((clip) => clip.id === id),
    touched: (id) => delta?.clips?.find((clip) => clip.id === id),
  };
}

describe('v3 round trips: written value → document → get_state → delta', () => {
  it('set_clip_properties: sound fields read back under the names and units they were written with', () => {
    const t = trip(project(), 'set_clip_properties', { items: [
      { clipId: 'spine-a', volumeDb: -6, mute: true, fades: { in: 12, out: 18 } },
      { clipId: 'bed', volumeDb: -14, fades: { in: 45, out: 60 }, speed: 1.5 },
      { clipId: 'broll', opacity: 0.5, filter: { brightness: 1.2 }, enabled: false, source: [2, 4] },
    ] });
    expect(t.clip('spine-a')).toMatchObject({ volumeDb: -6, mute: true, fades: { in: 12, out: 18 } });
    expect(t.clip('bed')).toMatchObject({ volumeDb: -14, fades: { in: 45, out: 60 }, speed: 1.5 });
    expect(t.clip('broll')).toMatchObject({ opacity: 0.5, filter: { brightness: 1.2 }, enabled: false, source: [2, 4] });
    for (const id of ['spine-a', 'bed', 'broll']) expect(t.touched(id), id).toBeDefined();
    expect(t.touched('spine-a')).toMatchObject({ fades: { in: 12, out: 18 } });
  });

  it('set_clip_properties: durationFrames and box on a graphic read back as frames and box', () => {
    const t = trip(project(), 'set_clip_properties', { items: [{ clipId: 'title', durationFrames: 90, box: { x: 0.2, y: 0.3, w: 0.4, h: 0.1 } }] });
    expect(t.clip('title')).toMatchObject({ frames: [30, 120], component: { box: { x: 0.2, y: 0.3, w: 0.4, h: 0.1 } } });
    expect(t.touched('title')).toMatchObject({ frames: [30, 120] });
  });

  it('move_clips: new frames and the destination track read back; the delta names the moved clip', () => {
    const t = trip(project(), 'move_clips', { items: [{ clipId: 'broll', startFrame: 400 }] });
    expect(t.clip('broll')).toMatchObject({ frames: [400, 490] });
    expect(t.touched('broll')).toMatchObject({ frames: [400, 490], trackId: t.clip('broll')!.trackId });
  });

  it('add_clips: the receipt returns the created ids, which exist in state with their track', () => {
    const t = trip(project(), 'add_clips', { clips: [{ assetId: 'cam2', role: 'broll', startFrame: 450, durationFrames: 30, mute: false, volumeDb: -3 }] });
    const [id] = (t.data as { clipIds: string[] }).clipIds;
    expect(id).toBeTruthy();
    const view = t.clip(id!)!;
    expect(view).toMatchObject({ kind: 'media', assetId: 'cam2', frames: [450, 480] });
    expect(t.state.tracks.find((track) => track.id === view.trackId)?.role).toBe('broll');
    expect(t.touched(id!)).toBeDefined();
  });

  it('add_clips words: a passage placed by its first and last word id plays exactly that source span, asset inferred', () => {
    const document = project();
    document.semantics.transcripts = { cam: [
      { start: 0, end: 2.4, text: 'hello there world', words: [{ start: 0.1, end: 0.5, text: 'hello' }, { start: 0.6, end: 1.0, text: 'there' }, { start: 1.2, end: 1.7, text: 'world' }] },
      { start: 3, end: 5, text: 'second sentence', words: [{ start: 3.1, end: 3.6, text: 'second' }, { start: 3.8, end: 4.5, text: 'sentence' }] },
    ] };
    const listed = listDocumentAddressedWords(document, { assetId: 'cam' });
    if ('error' in listed) throw new Error(listed.error);
    const ids = listed.words.map((word) => word.id);
    const t = trip(document, 'add_clips', { clips: [{ id: 'quote', role: 'broll', startFrame: 500, words: [ids[1]!, ids[3]!] }] });
    expect(t.clip('quote')).toMatchObject({ kind: 'media', assetId: 'cam', source: [0.6, 3.6], frames: [500, 590] });
    expect(t.touched('quote')).toBeDefined();
    // ids are the only contract: a stale id is unknown_id, and a mismatching assetId is refused
    expect(runAgentTimelineTool(document, 'add_clips', { clips: [{ role: 'broll', startFrame: 0, words: ['word_asset_zz_0_0_0'] }] }))
      .toMatchObject({ ok: false, error: 'unknown_id', data: { unknownIds: ['word_asset_zz_0_0_0'] } });
    expect(runAgentTimelineTool(document, 'add_clips', { clips: [{ assetId: 'cam2', role: 'broll', startFrame: 0, words: [ids[0]!] }] }))
      .toMatchObject({ ok: false, error: 'invalid_value', data: { path: 'clips[0].assetId' } });
    expect(runAgentTimelineTool(document, 'add_clips', { clips: [{ role: 'broll', startFrame: 0 }] }))
      .toMatchObject({ ok: false, error: 'missing_field', data: { path: 'clips[0].assetId' } });
  });

  it('remove_clips: the delta lists the removed ids and the source span that left the timeline', () => {
    const t = trip(project(), 'remove_clips', { clipIds: ['spine-b'] });
    expect(t.clip('spine-b')).toBeUndefined();
    expect(t.data).toMatchObject({ removedClipIds: ['spine-b'] });
    expect(t.delta?.removedClipIds).toEqual(['spine-b']);
    expect(t.delta?.removedSource).toContainEqual({ clipId: 'spine-b', assetId: 'cam', source: [10, 20], fromFrame: 300 });
  });

  it('split_clips: created ids come back and both halves read back contiguous', () => {
    const t = trip(project(), 'split_clips', { items: [{ clipId: 'broll', atFrame: 90 }] });
    const created = (t.data as { createdClipIds?: string[] }).createdClipIds ?? [];
    expect(created.length).toBeGreaterThanOrEqual(1);
    const [left, right] = [t.clip('broll'), t.clip(created[0]!)].sort((a, b) => a!.frames[0] - b!.frames[0]);
    expect(left!.frames[1]).toBe(90);
    expect(right!.frames[0]).toBe(90);
    expect(t.touched(created[0]!)).toBeDefined();
  });

  it('ripple_delete_ranges: removed span and the shift of later material are both reported', () => {
    const t = trip(project(), 'ripple_delete_ranges', { ranges: [[100, 200]] });
    expect(t.data).toMatchObject({ removedFrames: 100 });
    expect(t.clip('spine-b')!.frames[0]).toBe(200);
    const shiftedB = t.touched('spine-b') ?? t.delta?.shifted?.find((rule) => rule.byFrames === -100);
    expect(shiftedB, JSON.stringify(t.delta)).toBeDefined();
  });

  it('set_clip_framing: a treatment on the spine and a box on a graphic read back', () => {
    const t = trip(project(), 'set_clip_framing', { items: [
      { clipId: 'spine-a', treatment: 'punch-in' },
      { clipId: 'title', box: { x: 0.5, y: 0.5, w: 0.3, h: 0.1 } },
    ] });
    expect(t.clip('spine-a')).toMatchObject({ treatment: 'punch-in' });
    expect(t.clip('title')!.component!.box).toMatchObject({ x: 0.5, y: 0.5, w: 0.3, h: 0.1 });
    expect(t.touched('spine-a')).toMatchObject({ treatment: 'punch-in' });
  });

  it('set_clip_framing zoom: a push-in reads back in timeline frames on spine and B-roll clips, and none removes it', () => {
    const t = trip(project(), 'set_clip_framing', { items: [
      { clipId: 'spine-a', zoom: { preset: 'punch', atFrame: 45, durationFrames: 60, scale: 1.3, anchorY: 0.4 } },
      { clipId: 'broll', zoom: { preset: 'slow-push' } },
    ] });
    expect(t.clip('spine-a')!.zoom).toEqual({ preset: 'punch', atFrame: 45, durationFrames: 60, scale: 1.3, anchorY: 0.4 });
    expect(t.clip('broll')!.zoom).toEqual({ preset: 'slow-push', atFrame: 60, scale: 1.15 });
    expect(t.touched('spine-a')).toMatchObject({ zoom: { preset: 'punch', atFrame: 45 } });
    expect(t.data).toMatchObject({ updates: [{ clipId: 'spine-a', zoom: { preset: 'punch' } }, { clipId: 'broll', zoom: { preset: 'slow-push', atFrame: 60 } }] });
    const cleared = trip(t.document, 'set_clip_framing', { items: [{ clipId: 'spine-a', zoom: { preset: 'none' } }] });
    expect(cleared.clip('spine-a')).not.toHaveProperty('zoom');
    // a still or a graphic cannot be pushed in; the refusal names the tool that animates it
    for (const clipId of ['still-clip', 'title']) {
      expect(runAgentTimelineTool(project(), 'set_clip_framing', { items: [{ clipId, zoom: { preset: 'punch' } }] }), clipId)
        .toMatchObject({ ok: false, error: 'unknown_field', data: { path: 'items[0].zoom', fix: expect.stringContaining('set_keyframes') } });
    }
  });

  it('swap_clip_media: the asset changes, frames and source stay', () => {
    const t = trip(project(), 'swap_clip_media', { clipId: 'broll', assetId: 'cam' });
    expect(t.clip('broll')).toMatchObject({ assetId: 'cam', frames: [60, 150] });
    expect(t.touched('broll')).toMatchObject({ assetId: 'cam' });
  });

  it('set_keyframes: the opacity track reads back on the media clip', () => {
    const t = trip(project(), 'set_keyframes', { clipId: 'broll', property: 'opacity', keyframes: [{ atSec: 0, value: 0 }, { atSec: 1, value: 1 }] });
    expect(t.clip('broll')!.keyframes).toMatchObject({ opacity: [{ value: 0 }, { value: 1 }] });
    expect(t.touched('broll')).toHaveProperty('keyframes');
  });

  it('manage_tracks: a created lane comes back with its id, role and order in receipt, state and delta', () => {
    const t = trip(project(), 'manage_tracks', { action: 'create', type: 'graphics', role: 'graphics', name: 'Lower thirds', order: 25 });
    const { trackId } = t.data as { trackId: string };
    expect(trackId).toBeTruthy();
    expect(t.state.tracks.find((track) => track.id === trackId)).toMatchObject({ type: 'graphics', role: 'graphics', name: 'Lower thirds', order: 25 });
    expect(t.delta?.createdTracks).toContainEqual({ id: trackId, type: 'graphics', role: 'graphics', order: 25 });
  });

  it('manage_clip_links: the link group reads back on both clips', () => {
    const t = trip(project(), 'manage_clip_links', { action: 'link', clipIds: ['broll', 'bed'] });
    const { groupId } = t.data as { groupId?: string };
    expect(groupId).toBeTruthy();
    expect(t.clip('broll')).toMatchObject({ linkGroupId: groupId });
    // the linked audio folds into its visual partner, so the bed reads back there
    expect(t.clip('broll')!.audio).toMatchObject({ clipId: 'bed' });
  });

  it('add_transition: the transition reads back on the clip it leads into, in frames', () => {
    const t = trip(project(), 'add_transition', { atFrame: 300, effect: 'fade', durationFrames: 15 });
    expect(t.data).toMatchObject({ atFrame: 300, clipId: 'spine-b', effect: 'fade', durationFrames: 15 });
    expect(t.clip('spine-b')).toMatchObject({ transitionIn: { effect: 'fade', durationFrames: 15 } });
    expect(t.touched('spine-b')).toMatchObject({ transitionIn: { effect: 'fade' } });
  });

  it('set_canvas: the new size reads back and the delta reports from → to', () => {
    const t = trip(project(), 'set_canvas', { preset: 'landscape' });
    expect(t.state.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(t.delta?.canvas).toEqual({ from: [1080, 1920], to: [1920, 1080] });
  });

  it('set_texts: a created text clip reads back with its id, frames and component', () => {
    const t = trip(project(), 'set_texts', { items: [{ id: 'hello', text: 'Hello', startFrame: 120, durationFrames: 60 }] });
    expect(t.clip('hello')).toMatchObject({ kind: 'graphic', frames: [120, 180] });
    expect(t.clip('hello')!.component?.componentId).toBeTruthy();
    expect(t.touched('hello')).toBeDefined();
  });

  it('apply_layout: media-only layout boxes read back on each media clip', () => {
    const t = trip(project(), 'apply_layout', { layout: 'split-top-bottom', blockIds: ['broll', 'still-clip'] });
    expect(t.clip('broll')!.box).toBeDefined();
    expect(t.clip('still-clip')!.box).toBeDefined();
    expect(t.clip('broll')!.box!.y).not.toBe(t.clip('still-clip')!.box!.y);
  });
});
