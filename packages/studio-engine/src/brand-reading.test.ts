import { describe, expect, it } from 'vitest';
import { NOT_BRAND, WINDOWS } from './brand-method';
import { coverHeadlineSystemPrompt, coverSystemPrompt, parseCover, parseCoverFrame, parseCoverHeadline, parseMoments, parseSynthesis, parseVideoReading, readingSystemPrompt, synthesisSystemPrompt } from './brand-reading';

describe('method prompts', () => {
  it('read each video by block, from the overview, the ends and the moments', () => {
    const reading = readingSystemPrompt();
    expect(reading).toContain('moment strips');
    expect(reading).toContain('- graphics:');
    expect(reading).toContain('- visual:');
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
  it('keeps the times the reading picked as showing a block best', () => {
    const parsed = parseVideoReading(JSON.stringify({ portrait: 'x', references: { graphics: [150.8, '321.6s', 400, 500], visual: [], layout: [3] } }), 'v1', 0);
    expect(parsed.references).toEqual({ graphics: [150.8, 321.6] });
  });

  it('keeps what each moment was about, its source and how it was shown', () => {
    const parsed = parseVideoReading(JSON.stringify({ portrait: 'x', moments: [{ seen: ['broll'], speech: 'number', source: 'chart', presentation: 'full_frame', how: '3D bars rise' }] }), 'v1', 1);
    expect(parsed.moments[0]).toEqual({ seen: ['broll'], speech: 'number', source: 'chart', presentation: 'full_frame', how: '3D bars rise' });
  });

  const reading = (extra: Record<string, unknown>) => JSON.stringify({ portrait: 'Quick talk.', facets: { layout: 'full_frame_host', camera: 'nonsense' }, look: { captionFill: '#FFFFFF', palette: ['#ff0000', 'red'] }, ...extra });

  it('keeps what was seen, sets aside names outside the vocabulary, and blanks unknown facets', () => {
    const parsed = parseVideoReading(reading({ moments: [{ seen: ['motion_graphic', 'zoom_blur'], how: 'a number card pops in' }, { seen: ['nothing'] }, { seen: ['broll'] }], notes: { graphics: 'White rounded cards.', captions: 'ignored' } }), 'v1', 2);
    expect(parsed.moments).toEqual([{ seen: ['motion_graphic'], how: 'a number card pops in' }, { seen: ['nothing'] }]);
    expect(parsed.unread).toEqual(['zoom_blur']);
    expect(parsed.notes).toEqual({ graphics: 'White rounded cards.' });
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
  const synthesis = (blocks: Record<string, unknown>) => JSON.stringify({ blocks: { portrait: { text: '快节奏', videos: [] }, ...blocks } });

  it('keeps blocks that hold in two videos', () => {
    const parsed = parseSynthesis(synthesis({ visual: { text: '说到价格推近', videos: ['v1', 'v2', 'v9'] } }), videos);
    expect(parsed.blocks.visual).toEqual({ text: '说到价格推近', videos: ['v1', 'v2'] });
    expect(parsed.setAside).toEqual([]);
  });

  it('keeps a block seen in one video (style is judged, not counted); sets aside empty or unknown blocks', () => {
    const parsed = parseSynthesis(synthesis({ visual: { text: '顶部标题栏', videos: ['v1'] }, structure: { text: '', videos: ['v1', 'v2'] }, cover: { text: '人物在右', videos: ['v1', 'v2'] }, moves: { text: 'x', videos: ['v1', 'v2'] } }), videos);
    expect(parsed.blocks.visual).toEqual({ text: '顶部标题栏', videos: ['v1'] });
    expect(parsed.setAside).toEqual(['structure: no text', 'cover: not a block', 'moves: not a block']);
  });

  it('takes a block written as plain text, keeping it as uncited', () => {
    const parsed = parseSynthesis(JSON.stringify({ blocks: { portrait: '快节奏', visual: '说到价格推近', structure: { text: '结论先行', videos: [] } } }), videos);
    expect(parsed.blocks.portrait).toEqual({ text: '快节奏', videos: [] });
    expect(parsed.blocks.visual).toEqual({ text: '说到价格推近', videos: [] });
    expect(parsed.uncited).toEqual(['visual', 'structure']);
  });

  it('fails when the answer has no portrait or is not JSON', () => {
    expect(() => parseSynthesis('nope', videos)).toThrow(/json/);
    expect(() => parseSynthesis(JSON.stringify({ blocks: {} }), videos)).toThrow(/portrait/);
  });
});

describe('cover', () => {
  it('asks for the two parts, from the covers, in the brand language', () => {
    const prompt = coverSystemPrompt('Simplified Chinese');
    expect(prompt).toMatch(/frame —[\s\S]*design —/);
    expect(prompt).not.toMatch(/^headline —/m);
    expect(prompt).toContain('Write both parts in Simplified Chinese.');
    expect(synthesisSystemPrompt('English')).not.toMatch(/^- cover:/m);
    expect(readingSystemPrompt()).not.toContain('"cover"');
  });

  it('keeps the cover prompt as judged, with the covers it cites', () => {
    expect(parseCover(JSON.stringify({ frame: '惊讶表情', design: '人物在右', covers: [2, 0, 0, 9] }), 3)).toEqual({ frame: '惊讶表情', design: '人物在右', covers: [0, 2] });
    expect(parseCover(JSON.stringify({ frame: '惊讶表情', design: '人物在右', covers: [1] }), 3)).toEqual({ frame: '惊讶表情', design: '人物在右', covers: [1] });
    expect(parseCover(JSON.stringify({ frame: '惊讶表情', design: '人物在右', covers: [] }), 1)).toEqual({ frame: '惊讶表情', design: '人物在右', covers: [] });
    expect(() => parseCover(JSON.stringify({ design: '人物在右' }), 2)).toThrow(/frame/);
  });

  it('reads the picked still, refusing an index out of range', () => {
    expect(parseCoverFrame('{"pick":3}', 8)).toBe(3);
    expect(() => parseCoverFrame('{"pick":8}', 8)).toThrow(/pick/);
  });
});

describe('cover headline', () => {
  it('asks for one headline from what the video says', () => {
    expect(coverHeadlineSystemPrompt()).toContain('Write one headline, the best one');
  });

  it('reads one to three short lines', () => {
    expect(parseCoverHeadline('{"lines":["评论区问题精选"," 总有你关心的 ",""]}')).toEqual(['评论区问题精选', '总有你关心的']);
    expect(parseCoverHeadline('{"lines":[]}')).toEqual([]);
    expect(() => parseCoverHeadline(JSON.stringify({ lines: ['x'.repeat(41)] }))).toThrow(/lines/);
  });
});

describe('moment vocabulary', () => {
  it('reads moments in the same words', () => {
    const parsed = parseVideoReading(JSON.stringify({ portrait: 'x', moments: [{ seen: ['broll'], speech: 'company', source: 'news_footage', presentation: 'full_frame' }, { seen: ['nothing'], speech: 'tariffs', presentation: 'none' }] }), 'v1', 2);
    expect(parsed.moments).toEqual([{ seen: ['broll'], speech: 'company', source: 'news_footage', presentation: 'full_frame' }, { seen: ['nothing'] }]);
    expect(parsed.unread).toEqual(['tariffs']);
  });
});

