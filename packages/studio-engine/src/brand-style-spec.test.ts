import { describe, expect, it } from 'vitest';
import { STYLE_SYSTEM_IDS, parseBrandStyleSpec, parseVideoStyleReading, styleSpecForGeneration } from './brand-style-spec';

const videos = [{ id: 'v1', durationSec: 40 }, { id: 'v2', durationSec: 55 }, { id: 'v3', durationSec: 30 }];
const absent = { present: false, summary: '', rules: [], tokens: {}, variations: '', confidence: 'low' };
function spec(patch: Record<string, unknown> = {}) {
  return {
    summary: '快节奏口播，大号窄体字幕逐词弹出，黄色关键词。', summaryEn: 'Fast talking head with large condensed captions popping per word and yellow keywords.',
    systems: {
      ...Object.fromEntries(STYLE_SYSTEM_IDS.map(id => [id, absent])),
      captions: {
        present: true, summary: '每行 2–3 个词的粗体窄字，逐词弹出', variations: '颜色偶尔换成品牌粉', confidence: 'high',
        tokens: { bottomPct: 60, keywordColor: '#FFE34F', wordsPerLine: 3 },
        rules: [{ text: '关键词用黄色并放大 10%', en: 'Color the key word yellow and scale it up 10%.', videos: ['v1', 'v2', 'v3'], evidence: [{ video: 'v1', sec: 12.34 }] }],
      },
      ...patch,
    },
  };
}

describe('brand style spec', () => {
  it('parses a per-video reading with timed observations', () => {
    const reading = parseVideoStyleReading(JSON.stringify({ summary: 'Talking head', systems: { captions: { present: true, observations: [{ text: 'Words pop in one by one', times: [1.23, 4] }] } } }), 'v1', 40);
    expect(reading.systems.captions!.observations[0]).toEqual({ text: 'Words pop in one by one', times: [1.2, 4] });
    expect(() => parseVideoStyleReading(JSON.stringify({ summary: 'x', systems: { captions: { present: true, observations: [{ text: 'late', times: [99] }] } } }), 'v1', 40)).toThrow('times');
    expect(() => parseVideoStyleReading(JSON.stringify({ summary: 'x', systems: { lighting: { present: true } } }), 'v1', 40)).toThrow('lighting');
  });

  it('accepts recurring rules with valid evidence', () => {
    const parsed = parseBrandStyleSpec(JSON.stringify(spec()), videos);
    expect(parsed.systems.captions.rules[0]).toMatchObject({ videos: ['v1', 'v2', 'v3'], evidence: [{ video: 'v1', sec: 12.3 }] });
    expect(parsed.systems.graphics.present).toBe(false);
  });

  it('refuses one-off rules, bad evidence, bad colors and missing systems', () => {
    const withRule = (rule: Record<string, unknown>) => JSON.stringify(spec({ captions: { ...spec().systems.captions, rules: [{ text: 't', en: 'e', videos: ['v1', 'v2'], evidence: [], ...rule }] } }));
    expect(() => parseBrandStyleSpec(withRule({ videos: ['v1'] }), videos)).toThrow('support');
    expect(() => parseBrandStyleSpec(withRule({ evidence: [{ video: 'v9', sec: 1 }] }), videos)).toThrow('evidence');
    expect(() => parseBrandStyleSpec(withRule({ evidence: [{ video: 'v3', sec: 45 }] }), videos)).toThrow('sec');
    expect(() => parseBrandStyleSpec(JSON.stringify(spec({ color: { ...absent, present: true, summary: 's', rules: [{ text: 't', en: 'e', videos: ['v1', 'v2'] }], tokens: { accentColor: 'yellow' } } })), videos)).toThrow('accentColor');
    const { systems } = spec(); delete (systems as Record<string, unknown>).sound;
    expect(() => parseBrandStyleSpec(JSON.stringify({ ...spec(), systems }), videos)).toThrow('systems.sound');
  });

  it('renders present systems for generators in English only', () => {
    const text = styleSpecForGeneration({ ...parseBrandStyleSpec(JSON.stringify(spec()), videos), frames: [] });
    expect(text).toContain('## captions');
    expect(text).toContain('Color the key word yellow');
    expect(text).toContain('keywordColor=#FFE34F');
    expect(text).not.toContain('## graphics');
    expect(text).not.toMatch(/[一-鿿]/);
  });
});
