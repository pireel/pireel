import { describe, expect, it } from 'vitest';
import { TRANSITION_EFFECT_IDS } from './schemas';
import { validateV3Input } from './validate';

describe('validateV3Input', () => {
  it('refuses an effect outside the enum and lists what is allowed', () => {
    expect(validateV3Input('add_transition', { atFrame: 30, effect: 'dip-to-black' })).toMatchObject({
      error: 'invalid_value', path: 'effect', value: 'dip-to-black', allowed: TRANSITION_EFFECT_IDS,
    });
    expect(validateV3Input('add_transition', { atFrame: 30, effect: 'fadeblack' })).toBeNull();
  });

  it('names the shape when objects arrive where [from, to] pairs are expected', () => {
    const found = validateV3Input('ripple_delete_ranges', { ranges: [{ fromFrame: 60, toFrame: 90 }] });
    expect(found).toMatchObject({ error: 'invalid_shape', path: 'ranges[0]' });
    expect(found?.fix).toContain('two-integer array [from, to]');
    expect(validateV3Input('ripple_delete_ranges', { ranges: [[60, 90]] })).toBeNull();
    expect(validateV3Input('remove_words', { ranges: [[95.5, 106.7]] })).toBeNull();
    expect(validateV3Input('remove_words', { ranges: [[95.5]] })).toMatchObject({ error: 'invalid_shape', path: 'ranges[0]' });
  });

  it('checks a whiteboard document node by node: content fields are closed per kind', () => {
    const doc = (content: Record<string, unknown>) => ({
      narration: { durationSec: 4, sentences: [{ id: 's1', text: 'One step.' }] },
      board: { nodes: [{ id: 'n1', content }] },
      scenes: [{ id: 'a', nodeIds: ['n1'], layout: { type: 'free' } }],
      beats: [{ id: 'b1', anchor: { sentence: 's1' }, actions: [{ op: 'reveal', target: 'n1' }], camera: 'overview' }],
    });
    expect(validateV3Input('set_whiteboard', { startFrame: 0, doc: doc({ kind: 'sticky', color: 'yellow', title: 'Step' }) })).toBeNull();
    expect(validateV3Input('set_whiteboard', { startFrame: 0, doc: doc({ kind: 'sticky', color: 'teal', title: 'Step' }) })).toMatchObject({ error: 'invalid_value', path: 'doc.board.nodes[0].content' });
    expect(validateV3Input('set_whiteboard', { startFrame: 0, doc: doc({ kind: 'card', color: 'blue', title: 'Step', subtitle: 'x' }) })).toMatchObject({ path: 'doc.board.nodes[0].content' });
    // doc is optional in the schema so describe: true can stand alone; the executor requires it for edits.
    expect(validateV3Input('set_whiteboard', { describe: true })).toBeNull();
  });

  it('reports missing required fields and wrong primitive types by path', () => {
    expect(validateV3Input('add_transition', { effect: 'fade' })).toMatchObject({ error: 'missing_field', path: 'atFrame' });
    expect(validateV3Input('add_transition', { atFrame: '30' })).toMatchObject({ error: 'invalid_value', path: 'atFrame' });
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', mute: 'yes' }] })).toMatchObject({ error: 'invalid_value', path: 'items[0].mute' });
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', mute: true, source: [1, 2.5] }] })).toBeNull();
  });

  it('refuses fields the schema does not declare and names the ones it does', () => {
    const found = validateV3Input('inspect_media', { ids: ['a1'], mode: 'metadata', mode_extra: 'metadata' });
    expect(found).toMatchObject({ error: 'unknown_field', path: 'mode_extra', allowed: expect.arrayContaining(['ids', 'mode', 'clipIds']) });
    expect(validateV3Input('add_clips', { clips: [{ assetId: 'a1', startFrame: 0, muted: true }] })).toMatchObject({ error: 'unknown_field', path: 'clips[0].muted' });
    expect(validateV3Input('add_clips', { clips: [{ assetId: 'a1', startFrame: 0, mute: true }] })).toBeNull();
    expect(validateV3Input('remove_clips', { clipIds: ['c1'], ripple: true })).toMatchObject({ error: 'unknown_field', path: 'ripple' });
    expect(validateV3Input('swap_clip_media', { clipId: 'c1', assetId: 'a1' })).toBeNull();
  });

  it('leaves unknown tools and bounds to the executor', () => {
    expect(validateV3Input('not_a_tool', { anything: 1 })).toBeNull();
    expect(validateV3Input('set_clip_properties', { items: [{ clipId: 'c1', volumeDb: -999 }] })).toBeNull();
  });
});
