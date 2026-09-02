import { describe, expect, it } from 'vitest';
import { framesToSec, secToFrames, translateV3Call, type V3AdapterContext, type V3ClipKind } from './adapter';

const kinds: Record<string, V3ClipKind> = {
  n1: 'narrative', n2: 'narrative', b1: 'media', g1: 'graphic', g2: 'graphic', a1: 'audio', t1: 'text',
};
const ctx: V3AdapterContext = { fps: 30, kindOf: (id) => kinds[id] };

const ok = (result: ReturnType<typeof translateV3Call>) => {
  expect(result.status).toBe('ok');
  return result.status === 'ok' ? result.calls : [];
};

describe('frame ↔ second conversion', () => {
  it('rounds to milliseconds and back to nearest frame', () => {
    expect(framesToSec(45, 30)).toBe(1.5);
    expect(framesToSec(1, 30)).toBe(0.033);
    expect(secToFrames(1.5, 30)).toBe(45);
    expect(secToFrames(2.017, 30)).toBe(61);
  });
});

describe('v3 adapter translations', () => {
  it('routes moves by clip kind: graphics to move_block, everything else to move_clips', () => {
    const calls = ok(translateV3Call('move_clips', { items: [{ clipId: 'n1', startFrame: 90 }, { clipId: 'g1', startFrame: 120 }, { clipId: 'a1', startFrame: 0, trackId: 'tA' }] }, ctx));
    expect(calls).toEqual([
      { tool: 'move_clips', input: { items: [{ clipId: 'n1', startSec: 3 }, { clipId: 'a1', startSec: 0, toTrackId: 'tA' }] } },
      { tool: 'move_block', input: { blockId: 'g1', startSec: 4 } },
    ]);
  });

  it('rejects non-integer frames and unknown ids with a fix', () => {
    const bad = translateV3Call('move_clips', { items: [{ clipId: 'n1', startFrame: 1.5 }] }, ctx);
    expect(bad).toMatchObject({ status: 'error', error: 'invalid_frame', path: 'items[0].startFrame' });
    const unknown = translateV3Call('remove_clips', { clipIds: ['zzz'] }, ctx);
    expect(unknown).toMatchObject({ status: 'error', error: 'unknown_clip_id', value: ['zzz'] });
  });

  it('removes graphics, ripples narrative only when asked, and batches the rest', () => {
    expect(ok(translateV3Call('remove_clips', { clipIds: ['g1', 'g2', 'b1', 'n1'] }, ctx))).toEqual([
      { tool: 'delete_blocks', input: { blockIds: ['g1', 'g2'] } },
      { tool: 'remove_clips', input: { clipIds: ['b1', 'n1'] } },
    ]);
    expect(ok(translateV3Call('remove_clips', { clipIds: ['n1', 'n2'], ripple: true }, ctx))).toEqual([
      { tool: 'delete_shot', input: { shotId: 'n1' } },
      { tool: 'delete_shot', input: { shotId: 'n2' } },
    ]);
  });

  it('splits story-spine clips through split_shot (sorted, deduped) and others through split_clips', () => {
    expect(ok(translateV3Call('split_clips', { items: [{ atFrame: 300 }, { clipId: 'n1', atFrame: 150 }, { clipId: 'b1', atFrame: 60 }, { atFrame: 300 }] }, ctx))).toEqual([
      { tool: 'split_shot', input: { atSecs: [5, 10], purpose: 'editing' } },
      { tool: 'split_clips', input: { items: [{ clipId: 'b1', atSec: 2 }] } },
    ]);
  });

  it('cuts ripple ranges from the latest to the earliest so earlier frames stay valid', () => {
    expect(ok(translateV3Call('ripple_delete_ranges', { ranges: [[30, 60], [300, 330], [150, 180]] }, ctx))).toEqual([
      { tool: 'cut_range', input: { fromSec: 10, toSec: 11 } },
      { tool: 'cut_range', input: { fromSec: 5, toSec: 6 } },
      { tool: 'cut_range', input: { fromSec: 1, toSec: 2 } },
    ]);
    expect(translateV3Call('ripple_delete_ranges', { ranges: [[30, 90], [60, 120]] }, ctx)).toMatchObject({ status: 'error', error: 'overlapping_ranges' });
    expect(translateV3Call('ripple_delete_ranges', { ranges: [[90, 90]] }, ctx)).toMatchObject({ status: 'error', error: 'invalid_frames', path: 'ranges[0]' });
  });

  it('fans set_clip_properties out by kind and field', () => {
    const calls = ok(translateV3Call('set_clip_properties', {
      items: [
        { clipId: 'b1', volumeDb: -20, mute: true, fades: { in: 9, out: 12 }, speed: 0.5, filter: { saturate: 0 } },
        { clipId: 'a1', volumeDb: -14, fades: { in: 45, out: 60 }, source: [3, 33], assetId: 'asset-9' },
        { clipId: 'g1', durationFrames: 120, opacity: 0.8 },
      ],
    }, ctx));
    expect(calls).toEqual([
      { tool: 'set_clip_properties', input: { items: [
        { clipId: 'a1', sourceInSec: 3, sourceOutSec: 33, volumeDb: -14, audioFadeInSec: 1.5, audioFadeOutSec: 2 },
        { clipId: 'g1', opacity: 0.8 },
      ] } },
      { tool: 'set_shot_audio', input: { shotIds: ['b1'], volumeDb: -20, mute: true, fadeInSec: 0.3, fadeOutSec: 0.4 } },
      { tool: 'set_video_speed', input: { shotIds: ['b1'], speed: 0.5 } },
      { tool: 'set_video_filter', input: { shotId: 'b1', saturate: 0 } },
      { tool: 'swap_clip_media', input: { clipId: 'a1', assetId: 'asset-9' } },
      { tool: 'resize_block', input: { blockId: 'g1', durationSec: 4 } },
    ]);
    expect(translateV3Call('set_clip_properties', { items: [{ clipId: 'n1' }] }, ctx)).toMatchObject({ status: 'error', error: 'nothing_to_change' });
  });

  it('accepts both remove_words selectors and warns that positions shift', () => {
    const result = translateV3Call('remove_words', { ranges: [[12.4, 15.1]], wordIds: ['w7', 'w8'], keepGapSec: 0.35 }, ctx);
    expect(result).toMatchObject({ status: 'ok', note: expect.stringContaining('re-read get_transcript') });
    expect(ok(result)).toEqual([
      { tool: 'cut_narration', input: { ranges: [[12.4, 15.1]], keepGapSec: 0.35 } },
      { tool: 'delete_words', input: { wordIds: ['w7', 'w8'] } },
    ]);
    expect(translateV3Call('remove_words', {}, ctx)).toMatchObject({ status: 'error', error: 'missing_field' });
  });

  it('samples inspect_timeline evenly inside a frame window, capped at 12', () => {
    const calls = ok(translateV3Call('inspect_timeline', { fromFrame: 0, toFrame: 600, maxFrames: 4 }, ctx));
    expect(calls.map((call) => call.input.atSec)).toEqual([2.5, 7.5, 12.5, 17.5]);
    expect(ok(translateV3Call('inspect_timeline', { frames: [30, 90] }, ctx))).toEqual([
      { tool: 'capture_frame', input: { atSec: 1 } },
      { tool: 'capture_frame', input: { atSec: 3 } },
    ]);
    expect(ok(translateV3Call('inspect_timeline', { sceneIds: ['s1'] }, ctx))).toEqual([{ tool: 'review_sequence', input: { sceneIds: ['s1'] } }]);
    expect(translateV3Call('inspect_timeline', { frames: Array.from({ length: 13 }, (_, index) => index) }, ctx)).toMatchObject({ status: 'error', path: 'frames' });
  });

  it('reads transcripts as segments or words with frame windows converted to seconds', () => {
    expect(ok(translateV3Call('get_transcript', { clipId: 'n1' }, ctx))).toEqual([{ tool: 'read_script', input: { clipId: 'n1' } }]);
    expect(ok(translateV3Call('get_transcript', { granularity: 'words', clipId: 'n1', fromFrame: 300, toFrame: 450, limit: 80 }, ctx))).toEqual([
      { tool: 'list_words', input: { shotId: 'n1', fromSec: 10, toSec: 15, limit: 80 } },
    ]);
  });

  it('collapses project and output management into one tool', () => {
    expect(ok(translateV3Call('manage_project', { scope: 'project', action: 'switch', id: 'p9' }, ctx))).toEqual([{ tool: 'switch_project', input: { project_id: 'p9' } }]);
    expect(ok(translateV3Call('manage_project', { action: 'duplicate', position: 1, title: 'Cutdown' }, ctx))).toEqual([{ tool: 'duplicate_output', input: { position: 1, title: 'Cutdown' } }]);
    expect(translateV3Call('manage_project', { scope: 'project', action: 'delete' }, ctx)).toMatchObject({ status: 'error', allowed: ['list', 'switch', 'create', 'rename'] });
  });

  it('splits set_texts into adds and updates and converts timing', () => {
    expect(ok(translateV3Call('set_texts', { items: [
      { text: 'Hook', startFrame: 6, durationFrames: 108, preset: 'headline' },
      { id: 't1', text: 'Fixed wording' },
    ] }, ctx))).toEqual([
      { tool: 'add_texts', input: { items: [{ text: 'Hook', preset: 'headline', startSec: 0.2, durationSec: 3.6 }] } },
      { tool: 'update_text', input: { items: [{ clipId: 't1', text: 'Fixed wording' }] } },
    ]);
    expect(translateV3Call('set_texts', { items: [{ text: 'no start' }] }, ctx)).toMatchObject({ status: 'error', path: 'items[0]' });
  });

  it('maps the small action tools', () => {
    expect(ok(translateV3Call('preview', { action: 'seek', frame: 450 }, ctx))).toEqual([{ tool: 'seek', input: { toSec: 15 } }]);
    expect(ok(translateV3Call('preview', { action: 'play', frame: 0, toFrame: 300 }, ctx))).toEqual([{ tool: 'play', input: { fromSec: 0, toSec: 10 } }]);
    expect(ok(translateV3Call('export', { action: 'status' }, ctx))).toEqual([{ tool: 'track_export', input: {} }]);
    expect(ok(translateV3Call('generate_audio', { kind: 'sfx', prompt: 'short whoosh', durationSec: 1.5 }, ctx))).toEqual([{ tool: 'generate_sfx', input: { prompt: 'short whoosh', durationSec: 1.5 } }]);
    expect(ok(translateV3Call('manage_voices', { action: 'list', query: 'warm' }, ctx))).toEqual([{ tool: 'list_voices', input: { query: 'warm' } }]);
    expect(ok(translateV3Call('ask_user', { kind: 'approval', title: 'Generate?', content: '3 clips' }, ctx))).toEqual([{ tool: 'request_approval', input: { title: 'Generate?', content: '3 clips' } }]);
    expect(ok(translateV3Call('manage_frame', { action: 'attach', id: 'editorial-mono' }, ctx))).toEqual([{ tool: 'attach_frame', input: { frame_id: 'editorial-mono' } }]);
    expect(ok(translateV3Call('add_transition', { atFrame: 300, effect: 'fade', durationFrames: 30 }, ctx))).toEqual([{ tool: 'add_transition', input: { atSec: 10, effect: 'fade', durationSec: 1 } }]);
    expect(ok(translateV3Call('manage_tracks', { action: 'update', trackId: 't3', order: 30 }, ctx))).toEqual([{ tool: 'manage_tracks', input: { action: 'update', trackId: 't3', stackOrder: 30 } }]);
    expect(ok(translateV3Call('manage_clip_links', { action: 'sync', referenceClipId: 'n1', targets: [] }, ctx))).toEqual([{ tool: 'sync_clips', input: { referenceClipId: 'n1', targets: [] } }]);
  });

  it('refuses frame math without fps and unknown tools', () => {
    expect(translateV3Call('move_clips', { items: [{ clipId: 'n1', startFrame: 1 }] }, { fps: 0, kindOf: () => 'narrative' })).toMatchObject({ status: 'error', error: 'fps_unavailable' });
    expect(translateV3Call('set_director_plan', {}, ctx)).toMatchObject({ status: 'error', error: 'unknown_tool' });
  });
});
