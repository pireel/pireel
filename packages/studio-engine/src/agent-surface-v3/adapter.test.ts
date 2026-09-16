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

describe('native document tools pass through untouched', () => {
  it.each([
    ['add_clips', { clips: [{ assetId: 'a4', role: 'broll', startFrame: 900, durationFrames: 120, source: [3, 7], fades: { in: 9 }, mute: true }], placementAssets: [{ id: 'a4', kind: 'video' }] }],
    ['insert_clips', { clips: [{ assetId: 'a9', role: 'music' }], atFrame: 60 }],
    ['move_clips', { items: [{ clipId: 'n1', startFrame: 90 }, { clipId: 'g1', startFrame: 120 }] }],
    ['remove_clips', { clipIds: ['g1', 'n1'], ripple: true }],
    ['split_clips', { items: [{ atFrame: 300 }, { clipId: 'b1', atFrame: 60 }] }],
    ['ripple_delete_ranges', { ranges: [[30, 60], [300, 330]] }],
    ['set_clip_properties', { items: [{ clipId: 'b1', volumeDb: -20, fades: { in: 9, out: 12 }, speed: 0.5, filter: { saturate: 0 } }] }],
    ['set_clip_framing', { items: [{ clipId: 'n1', treatment: 'punch-in', scale: 1.3 }, { clipId: 'g1', box: { x: 0.06, y: 0.62, w: 0.5, h: 0.2 } }] }],
    ['add_transition', { atFrame: 300, effect: 'fade', durationFrames: 30 }],
    ['set_texts', { items: [{ text: 'Hook', startFrame: 6, durationFrames: 108, preset: 'headline' }, { id: 't1', text: 'Fixed wording' }] }],
    ['set_captions', { on: true, preset: 'ln-clean', yPct: 82, corrections: [{ index: 3, text: 'Fixed.' }], relayout: true }],
    ['manage_tracks', { action: 'update', trackId: 't3', order: 30 }],
    ['manage_clip_links', { action: 'sync', referenceClipId: 'n1', targets: [] }],
    ['mask_words', { wordIds: ['w1'], audio: 'beep' }],
    ['set_canvas', { preset: 'portrait' }],
    ['apply_layout', { layout: 'grid', blockIds: ['g1', 'g2'] }],
    ['set_keyframes', { clipId: 'b1', property: 'opacity', keyframes: [] }],
  ] as Array<[string, Record<string, unknown>]>)('%s reaches the engine under its own name with its own shape', (name, input) => {
    expect(ok(translateV3Call(name, input, ctx))).toEqual([{ tool: name, input }]);
  });

  it('checks remove_words pairs and hands both selectors to the one engine tool', () => {
    const result = translateV3Call('remove_words', { ranges: [[12.4, 15.1]], wordIds: ['w7', 'w8'], keepGapSec: 0.35 }, ctx);
    expect(result).toMatchObject({ status: 'ok', note: expect.stringContaining('re-read get_transcript') });
    expect(ok(result)).toEqual([{ tool: 'remove_words', input: { ranges: [[12.4, 15.1]], wordIds: ['w7', 'w8'], keepGapSec: 0.35 } }]);
    expect(translateV3Call('remove_words', {}, ctx)).toMatchObject({ status: 'error', error: 'missing_field' });
    expect(translateV3Call('remove_words', { ranges: [[15.1, 12.4]] }, ctx)).toMatchObject({ status: 'error', error: 'invalid_value', path: 'ranges[0]' });
    expect(translateV3Call('remove_words', { ranges: [{ fromFrame: 10, toFrame: 20 }] }, ctx)).toMatchObject({ status: 'error', error: 'invalid_value', path: 'ranges[0]' });
  });
});

describe('remaining translations (runtime and account tools)', () => {
  it('rejects invalid generation-model enums before dispatch', () => {
    for (const kind of ['audio', 'speech', '', 42, null]) {
      expect(translateV3Call('list_models', { kind }, ctx)).toMatchObject({ status: 'error', error: 'invalid_value', path: 'kind' });
    }
    expect(ok(translateV3Call('list_models', { kind: 'image' }, ctx))).toEqual([{ tool: 'list_models', input: { kind: 'image' } }]);
    expect(ok(translateV3Call('list_models', {}, ctx))).toEqual([{ tool: 'list_models', input: {} }]);
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
    expect(ok(translateV3Call('get_transcript', { granularity: 'words', assetId: 'up_1', trackId: 'track_narration' }, ctx))).toEqual([
      { tool: 'list_words', input: { assetId: 'up_1', trackId: 'track_narration' } },
    ]);
    expect(ok(translateV3Call('get_transcript', { granularity: 'words', clipId: 'n1', fromFrame: 300, toFrame: 450, limit: 80 }, ctx))).toEqual([
      { tool: 'list_words', input: { shotId: 'n1', fromSec: 10, toSec: 15, limit: 80 } },
    ]);
  });

  it('collapses project and output management into one tool', () => {
    expect(ok(translateV3Call('manage_project', { scope: 'project', action: 'switch', id: 'p9' }, ctx))).toEqual([{ tool: 'switch_project', input: { project_id: 'p9' } }]);
    expect(ok(translateV3Call('manage_project', { action: 'duplicate', position: 1, title: 'Cutdown' }, ctx))).toEqual([{ tool: 'duplicate_output', input: { position: 1, title: 'Cutdown' } }]);
    expect(translateV3Call('manage_project', { scope: 'project', action: 'delete' }, ctx)).toMatchObject({ status: 'error', allowed: ['list', 'switch', 'create', 'rename'] });
  });

  it('routes search_assets kind font to the pure font catalog lookup', () => {
    expect(ok(translateV3Call('search_assets', { scope: 'official', kind: 'font', query: 'inter', script: 'latin', category: 'sans', limit: 5 }, ctx))).toEqual([
      { tool: 'search_fonts', input: { query: 'inter', script: 'latin', category: 'sans', limit: 5 } },
    ]);
  });

  it('maps the small action tools', () => {
    expect(ok(translateV3Call('preview', { action: 'seek', frame: 450 }, ctx))).toEqual([{ tool: 'seek', input: { toSec: 15 } }]);
    expect(ok(translateV3Call('preview', { action: 'play', frame: 0, toFrame: 300 }, ctx))).toEqual([{ tool: 'play', input: { fromSec: 0, toSec: 10 } }]);
    expect(ok(translateV3Call('export', { action: 'status' }, ctx))).toEqual([{ tool: 'track_export', input: {} }]);
    expect(ok(translateV3Call('generate_audio', { kind: 'sfx', prompt: 'short whoosh', durationSec: 1.5 }, ctx))).toEqual([{ tool: 'generate_sfx', input: { prompt: 'short whoosh', durationSec: 1.5 } }]);
    expect(ok(translateV3Call('manage_voices', { action: 'list', query: 'warm' }, ctx))).toEqual([{ tool: 'list_voices', input: { query: 'warm' } }]);
    expect(ok(translateV3Call('ask_user', { kind: 'approval', title: 'Generate?', content: '3 clips' }, ctx))).toEqual([{ tool: 'request_approval', input: { title: 'Generate?', content: '3 clips' } }]);
    expect(ok(translateV3Call('manage_frame', { action: 'attach', id: 'editorial-mono' }, ctx))).toEqual([{ tool: 'attach_frame', input: { frame_id: 'editorial-mono' } }]);
  });

  it('inspects media by mode', () => {
    expect(ok(translateV3Call('inspect_media', { ids: ['a1', 'a2'] }, ctx))).toEqual([{ tool: 'inspect_media', input: { assetIds: ['a1', 'a2'] } }]);
    expect(ok(translateV3Call('inspect_media', { mode: 'frames', ids: ['img1'] }, ctx))).toEqual([{ tool: 'inspect_images', input: { refs: ['img1'] } }]);
    expect(ok(translateV3Call('inspect_media', { mode: 'geometry', ids: ['a1'] }, ctx))).toEqual([{ tool: 'analyze_visual', input: { mode: 'geometry', assetId: 'a1' } }]);
    expect(ok(translateV3Call('inspect_media', { mode: 'component', ids: ['g1'] }, ctx))).toEqual([{ tool: 'get_block', input: { blockId: 'g1' } }]);
    expect(ok(translateV3Call('inspect_media', { mode: 'generation' }, ctx))).toEqual([{ tool: 'get_generation_jobs', input: {} }]);
    expect(ok(translateV3Call('inspect_media', { mode: 'labels', labels: [{ index: 0, content: 'talkinghead', person: 'center', safe: 'left' }] }, ctx))[0]!.tool).toBe('submit_visual');
    expect(translateV3Call('inspect_media', { mode: 'frames', ids: [] }, ctx)).toMatchObject({ status: 'error', path: 'ids' });
  });

  it('searches or lists one asset scope, including stock', () => {
    expect(ok(translateV3Call('search_assets', { scope: 'official', kind: 'audio' }, ctx))).toEqual([{ tool: 'list_assets', input: { scope: 'official', kind: 'audio' } }]);
    expect(ok(translateV3Call('search_assets', { scope: 'mine', query: 'whoosh', limit: 5 }, ctx))).toEqual([{ tool: 'search_assets', input: { query: 'whoosh', scope: 'mine', limit: 5 } }]);
    expect(ok(translateV3Call('search_assets', { scope: 'stock', query: 'city night', kind: 'video' }, ctx))).toEqual([{ tool: 'search_stock', input: { query: 'city night', kind: 'video' } }]);
    expect(translateV3Call('search_assets', { scope: 'all' }, ctx)).toMatchObject({ status: 'error', path: 'query' });
  });

  it('registers direct assets and chains a stock import into register_media', () => {
    const payload = { query: 'city night', kind: 'video', page: 1, limit: 12, assetId: 'px_1' };
    expect(ok(translateV3Call('register_media', { stock: payload, assets: [{ id: 'gen_1', kind: 'audio', url: 'https://cdn/x.mp3' }] }, ctx))).toEqual([
      { tool: 'import_stock', input: payload },
      { tool: 'register_media', input: {}, usePrevious: { resultPath: 'data.registration', inputKey: 'assets', asArray: true } },
      { tool: 'register_media', input: { assets: [{ id: 'gen_1', kind: 'audio', url: 'https://cdn/x.mp3' }] } },
    ]);
  });

  it('applies BYO components and routes the hosted generator fallback', () => {
    expect(ok(translateV3Call('apply_component', { raw: 'note\n```html\n<div/>\n```', atFrame: 600, durationFrames: 120, placement: { xPct: 6, yPct: 62, widthPct: 50, heightPct: 20 } }, ctx))).toEqual([
      { tool: 'apply_block', input: { raw: 'note\n```html\n<div/>\n```', atSec: 20, durationSec: 4, placement: { xPct: 6, yPct: 62, widthPct: 50, heightPct: 20 } } },
    ]);
    expect(ok(translateV3Call('apply_component', { generate: true, clipId: 'g1', instruction: 'make the number bigger' }, ctx))).toEqual([{ tool: 'edit_block', input: { blockId: 'g1', instruction: 'make the number bigger' } }]);
    expect(ok(translateV3Call('apply_component', { generate: true, instruction: 'a stat card', atFrame: 30 }, ctx))).toEqual([{ tool: 'add_block', input: { instruction: 'a stat card', atSec: 1 } }]);
    expect(translateV3Call('apply_component', {}, ctx)).toMatchObject({ status: 'error', path: 'raw' });
  });

  it('composes a component brief through compose_context in seconds', () => {
    expect(ok(translateV3Call('compose_component', { instruction: 'a lower third', atFrame: 0, durationFrames: 90, placement: { xPct: 6, yPct: 70, widthPct: 60, heightPct: 18 }, backdrop: 'speaker on the left', fontFamily: 'web:douyin-sans' }, ctx))).toEqual([
      { tool: 'compose_context', input: { atSec: 0, durationSec: 3, placement: { xPct: 6, yPct: 70, widthPct: 60, heightPct: 18 }, backdrop: 'speaker on the left', fontFamily: 'web:douyin-sans' } },
    ]);
    expect(ok(translateV3Call('compose_component', { clipId: 'g1', instruction: 'rewrite the number' }, ctx))).toEqual([{ tool: 'compose_context', input: { blockId: 'g1' } }]);
  });

  it('batches only the editorial review; semantic and geometry run once per source', () => {
    const editorial = ok(translateV3Call('inspect_media', { mode: 'editorial', ids: ['a1', 'a2'], brief: 'b' }, ctx));
    expect(editorial).toHaveLength(1);
    expect(editorial[0]!.input).toMatchObject({ mode: 'editorial', brief: 'b', items: [{ assetId: 'a1' }, { assetId: 'a2' }] });
    const semantic = translateV3Call('inspect_media', { mode: 'semantic', ids: ['a1', 'a2'] }, ctx);
    expect(ok(semantic).map((call) => call.input)).toEqual([{ mode: 'semantic', assetId: 'a1' }, { mode: 'semantic', assetId: 'a2' }]);
    expect(semantic).toMatchObject({ note: expect.stringContaining('once per source') });
  });

  it('treats a clipId that is not a clip as a library asset id', () => {
    const inspect = ok(translateV3Call('inspect_media', { mode: 'editorial', clipId: 'local_abc', brief: 'b' }, ctx));
    expect(inspect[0]!.input).toMatchObject({ mode: 'editorial', assetId: 'local_abc' });
    expect(inspect[0]!.input).not.toHaveProperty('clipId');
    const transcript = ok(translateV3Call('get_transcript', { clipId: 'local_abc' }, ctx));
    expect(transcript[0]!.input).toEqual({ assetId: 'local_abc' });
  });

  it('maps search_media clipId onto the legacy source selector', () => {
    expect(ok(translateV3Call('search_media', { query: 'budget', clipId: 'n1', limit: 4 }, ctx))).toEqual([{ tool: 'search_media', input: { query: 'budget', limit: 4, shotId: 'n1' } }]);
  });

  it('reads skills and the speech-cleanup guide through one tool', () => {
    expect(ok(translateV3Call('read_skill', { id: 'usk_1' }, ctx))).toEqual([{ tool: 'read_skill', input: { skill_id: 'usk_1' } }]);
    expect(ok(translateV3Call('read_skill', { id: 'speech-cleanup' }, ctx))).toEqual([{ tool: 'read_editing_guide', input: {} }]);
    expect(ok(translateV3Call('prepare_local_asset', { assetId: 'local:img' }, ctx))).toEqual([{ tool: 'prepare_local_image', input: { assetId: 'local:img' } }]);
  });

  it('refuses unknown tools', () => {
    expect(translateV3Call('set_director_plan', {}, ctx)).toMatchObject({ status: 'error', error: 'unknown_tool' });
  });
});
