import { describe, expect, it } from 'vitest';
import { NOT_BRAND, WINDOWS } from './brand-method';
import { parseMoments, parseSynthesis, parseVideoReading, readingSystemPrompt, synthesisSystemPrompt } from './brand-reading';

describe('method prompts', () => {
  it('read each video by block, from the overview, the ends and the moments', () => {
    const reading = readingSystemPrompt();
    expect(reading).toContain('moment strips');
    expect(reading).toContain('- motion_graphics:');
    expect(reading).toContain('- editing:');
    expect(reading).not.toContain('- captions:');
  });

  it('write prose blocks from what recurs, describing moments and restraint, never rates', () => {
    const synthesis = synthesisSystemPrompt('Simplified Chinese');
    expect(synthesis).toContain('never a rate, an interval or a count');
    expect(synthesis).toContain('says how THIS creator uses them');
    expect(synthesis).toContain('never forbid it');
    for (const item of NOT_BRAND) expect(synthesis).toContain(item);
    expect(synthesis).toContain('Write every block in Simplified Chinese');
  });
});

describe('parseMoments', () => {
  const lines = [{ index: 0, startSec: 2 }, { index: 1, startSec: 15 }, { index: 2, startSec: 16 }, { index: 3, startSec: 40 }, { index: 4, startSec: 57 }];

  it('turns picked lines into windows in the middle of the video, without overlap', () => {
    const moments = parseMoments(JSON.stringify({ moments: [{ line: 3, why: 'a price' }, { line: 1, why: 'a number' }, { line: 2, why: 'overlaps' }, { line: 0, why: 'opening' }, { line: 4, why: 'ending' }, { line: 9 }] }), lines, 60);
    expect(moments).toEqual([{ startSec: 14.5, endSec: 14.5 + WINDOWS.momentSec, why: 'a number' }, { startSec: 39.5, endSec: 39.5 + WINDOWS.momentSec, why: 'a price' }]);
  });
});

describe('parseVideoReading', () => {
  const reading = (extra: Record<string, unknown>) => JSON.stringify({ portrait: 'Quick talk.', facets: { layout: 'full_frame_host', camera: 'nonsense' }, look: { captionFill: '#FFFFFF', palette: ['#ff0000', 'red'] }, ...extra });

  it('keeps what was seen, sets aside names outside the vocabulary, and blanks unknown facets', () => {
    const parsed = parseVideoReading(reading({ moments: [{ seen: ['motion_graphic', 'zoom_blur'], how: 'a number card pops in' }, { seen: ['nothing'] }, { seen: ['broll'] }], notes: { motion_graphics: 'White rounded cards.', captions: 'ignored' } }), 'v1', 2);
    expect(parsed.moments).toEqual([{ seen: ['motion_graphic'], how: 'a number card pops in' }, { seen: ['nothing'] }]);
    expect(parsed.unread).toEqual(['zoom_blur']);
    expect(parsed.notes).toEqual({ motion_graphics: 'White rounded cards.' });
    expect(parsed.facets.camera).toBeNull();
    expect(parsed.look).toEqual({ captionFill: '#ffffff', palette: ['#ff0000'] });
  });

  it('fails only on an answer that is not JSON', () => {
    expect(() => parseVideoReading('no json here', 'v1', 0)).toThrow(/json/);
    expect(parseVideoReading('{}', 'v1', 0)).toMatchObject({ portrait: '', moments: [], notes: {} });
  });
});

describe('parseSynthesis', () => {
  const videos = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }];
  const synthesis = (blocks: Record<string, unknown>) => JSON.stringify({ blocks: { portrait: { text: '快节奏', videos: [] }, ...blocks }, palette: { accent: '#FFD600', text: 'white' } });

  it('keeps blocks that hold in two videos and well-formed colours', () => {
    const parsed = parseSynthesis(synthesis({ editing: { text: '说到价格推近', videos: ['v1', 'v2', 'v9'] } }), videos);
    expect(parsed.blocks.editing).toEqual({ text: '说到价格推近', videos: ['v1', 'v2'] });
    expect(parsed.palette).toEqual({ accent: '#ffd600' });
    expect(parsed.setAside).toEqual([]);
  });

  it('sets aside blocks the answer places in one video, empty or unknown, with the reason', () => {
    const parsed = parseSynthesis(synthesis({ layout: { text: '顶部标题栏', videos: ['v1'] }, cover: { text: '', videos: ['v1', 'v2'] }, moves: { text: 'x', videos: ['v1', 'v2'] } }), videos);
    expect(parsed.blocks.layout).toBeUndefined();
    expect(parsed.setAside).toEqual(['layout: seen in 1 video(s)', 'cover: no text', 'moves: not a block']);
  });

  it('takes a block written as plain text, keeping it as uncited', () => {
    const parsed = parseSynthesis(JSON.stringify({ blocks: { portrait: '快节奏', editing: '说到价格推近', structure: { text: '结论先行', videos: [] } } }), videos);
    expect(parsed.blocks.portrait).toEqual({ text: '快节奏', videos: [] });
    expect(parsed.blocks.editing).toEqual({ text: '说到价格推近', videos: [] });
    expect(parsed.uncited).toEqual(['editing', 'structure']);
  });

  it('fails when the answer has no portrait or is not JSON', () => {
    expect(() => parseSynthesis('nope', videos)).toThrow(/json/);
    expect(() => parseSynthesis(JSON.stringify({ blocks: {} }), videos)).toThrow(/portrait/);
  });
});
