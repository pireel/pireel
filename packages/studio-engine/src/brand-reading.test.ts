import { describe, expect, it } from 'vitest';
import { NOT_BRAND } from './brand-method';
import { parseSynthesis, parseVideoReading, readingSystemPrompt, synthesisSystemPrompt } from './brand-reading';

describe('method prompts', () => {
  it('carry the live dimensions and leave out what A cannot see yet', () => {
    const reading = readingSystemPrompt();
    expect(reading).toContain('- punch_in:');
    expect(reading).toContain('Variants: punch | instant | slow-push | in-out.');
    expect(reading).not.toContain('- sfx:');
    expect(reading).not.toContain('- music:');
  });

  it('ask for triggers and levels, never rates, and name what is not brand', () => {
    const synthesis = synthesisSystemPrompt('Simplified Chinese');
    expect(synthesis).toContain('Never an interval or a count.');
    for (const item of NOT_BRAND) expect(synthesis).toContain(item);
    expect(synthesis).toContain('Write "text" in Simplified Chinese');
  });
});

describe('parseVideoReading', () => {
  const reading = (moves: unknown[]) => JSON.stringify({ portrait: 'Quick talk.', facets: { layout: 'full_frame_host', camera: 'nonsense' }, moves, opening: 'Starts on a question.', look: { captionFill: '#FFFFFF', palette: ['#ff0000', 'red'] } });

  it('keeps what was seen and blanks a facet out of vocabulary', () => {
    const parsed = parseVideoReading(reading([{ kind: 'punch_in', variants: ['punch'], times: [3.04, 12], on: 'the punchline' }]), 'v1', 30);
    expect(parsed.moves).toEqual([{ kind: 'punch_in', variants: ['punch'], times: [3, 12], on: 'the punchline' }]);
    expect(parsed.facets.layout).toBe('full_frame_host');
    expect(parsed.facets.camera).toBeNull();
    expect(parsed.look).toEqual({ captionFill: '#ffffff', palette: ['#ff0000'] });
    expect(parsed.opening).toBe('Starts on a question.');
  });

  it('fails on a move A does not read, a foreign variant or a time outside the video', () => {
    expect(() => parseVideoReading(reading([{ kind: 'music', variants: ['bed'], times: [1], on: 'x' }]), 'v1', 30)).toThrow(/moves\.0\.kind/);
    expect(() => parseVideoReading(reading([{ kind: 'punch_in', variants: ['whip'], times: [1], on: 'x' }]), 'v1', 30)).toThrow(/variants/);
    expect(() => parseVideoReading(reading([{ kind: 'punch_in', variants: ['punch'], times: [45], on: 'x' }]), 'v1', 30)).toThrow(/times/);
  });
});

describe('parseSynthesis', () => {
  const videos = [{ id: 'v1', durationSec: 30 }, { id: 'v2', durationSec: 40 }, { id: 'v3', durationSec: 50 }];
  const said = { text: '在结论处推近', en: 'Punch in on conclusions.' };
  const synthesis = (patch: Record<string, unknown> = {}) => JSON.stringify({
    portrait: { text: '快节奏', en: 'Fast.' },
    moves: [{ kind: 'punch_in', variants: ['punch'], frequency: 'moderate', trigger: said, videos: ['v1', 'v2'], evidence: [{ video: 'v1', sec: 3 }] }],
    opening: null, closing: { ...said, videos: ['v1', 'v3'] }, structure: [], palette: { accent: '#FFD600', text: 'white' }, cover: null, headlines: null, elements: [],
    ...patch,
  });

  it('parses the judged parts and keeps only well-formed colours', () => {
    const parsed = parseSynthesis(synthesis(), videos);
    expect(parsed.moves[0]).toMatchObject({ kind: 'punch_in', frequency: 'moderate', videos: ['v1', 'v2'], evidence: [{ video: 'v1', sec: 3 }] });
    expect(parsed.palette).toEqual({ accent: '#ffd600' });
    expect(parsed.closing?.videos).toEqual(['v1', 'v3']);
  });

  it('refuses what holds in one video only, unknown videos, rates and cited times outside a video', () => {
    expect(() => parseSynthesis(synthesis({ moves: [{ kind: 'punch_in', variants: ['punch'], frequency: 'moderate', trigger: said, videos: ['v1'], evidence: [] }] }), videos)).toThrow(/moves\.0\.videos/);
    expect(() => parseSynthesis(synthesis({ closing: { ...said, videos: ['v1', 'v9'] } }), videos)).toThrow(/closing\.videos/);
    expect(() => parseSynthesis(synthesis({ moves: [{ kind: 'punch_in', variants: ['punch'], frequency: 'every 8s', trigger: said, videos: ['v1', 'v2'], evidence: [] }] }), videos)).toThrow(/frequency/);
    expect(() => parseSynthesis(synthesis({ moves: [{ kind: 'punch_in', variants: ['punch'], frequency: 'rare', trigger: said, videos: ['v1', 'v2'], evidence: [{ video: 'v1', sec: 99 }] }] }), videos)).toThrow(/evidence/);
  });
});
