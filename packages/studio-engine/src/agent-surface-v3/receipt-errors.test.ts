import { describe, expect, it } from 'vitest';
import { describeStepFailure } from './receipt-errors';

const ctx = {
  kindOf: (id: string) => (({ ai1: 'graphic', clip_a: 'narrative', t1: 'text' }) as Record<string, 'graphic' | 'narrative' | 'text'>)[id],
  hasAsset: (id: string) => id === 'asset_x',
};

describe('describeStepFailure', () => {
  it('names an invented id and points the model back to state', () => {
    const failure = describeStepFailure(
      'set_texts',
      { items: [{ id: 'clip_text_vip', text: '1999' }, { id: 'clip_text_infoq', text: '34800' }] },
      'items[0] is not a title text clip',
      ctx,
    );
    expect(failure.error).toBe('unknown_id');
    expect(failure.unknownIds).toEqual(['clip_text_vip', 'clip_text_infoq']);
    expect(failure.fix).toContain('read get_state and send set_texts again with real ids');
    expect(failure.detail).toBe('items[0] is not a title text clip');
  });

  it('tells a real clip of the wrong kind apart and names the tool that acts on it', () => {
    const failure = describeStepFailure('set_texts', { items: [{ id: 'ai1', text: 'x' }] }, 'items[0] is not a title text clip', ctx);
    expect(failure.error).toBe('wrong_kind');
    expect(failure.fix).toContain('"ai1" is a graphic clip');
    expect(failure.fix).toContain('apply_component');
  });

  it('flags unknown clip ids anywhere in the call when the message is about a missing clip', () => {
    const failure = describeStepFailure('remove_clips', { clipIds: ['clip_a', 'ghost'] }, 'clip not found: ghost', ctx);
    expect(failure).toMatchObject({ error: 'unknown_id', unknownIds: ['ghost'] });
  });

  it('does not blame ids for unrelated failures and leaves the legacy message as the code', () => {
    const failure = describeStepFailure('add_clips', { clips: [{ assetId: 'asset_x', startFrame: 0 }] }, 'overlaps existing B-roll', ctx);
    expect(failure).toEqual({ error: 'overlaps existing B-roll', detail: 'overlaps existing B-roll' });
    const known = describeStepFailure('set_clip_properties', { items: [{ id: 'clip_a', volumeDb: -3 }] }, 'volumeDb out of range', ctx);
    expect(known.error).toBe('volumeDb out of range');
  });

  it('falls back to step_failed when the legacy layer said nothing', () => {
    expect(describeStepFailure('x', {}, undefined, ctx)).toEqual({ error: 'step_failed', detail: 'step_failed' });
  });
});

describe('describeStepFailure carried fix', () => {
  it('lifts a legacy step\'s data.fix into the receipt when it has no better guidance', () => {
    const failure = describeStepFailure('remove_words', { ranges: [[95.5, 106.7]] }, 'ranges_not_on_timeline', ctx, { fix: 'Re-read get_transcript.' });
    expect(failure).toEqual({ error: 'ranges_not_on_timeline', detail: 'ranges_not_on_timeline', fix: 'Re-read get_transcript.' });
  });
});
