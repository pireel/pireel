import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { displayCues, distributeSub } from './captions-relay';
import type { VideoShot } from './composition';

describe('sentence translation across cut fragments', () => {
  it('spreads one sentence translation once over every surviving cue, never once per fragment', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({ text: `词${i}`, start: i * 0.5, end: i * 0.5 + 0.4 }));
    const narr: AsrSegment[] = [{
      start: 0, end: 10, text: words.map((w) => w.text).join(''), words,
      sub: 'one two three four five six seven eight nine ten eleven twelve', subLang: 'English',
    }];
    // The sentence is cut in the middle: two surviving fragments play back to back.
    const shots: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'full' },
      { id: 'b', srcStart: 6, srcEnd: 10, treatment: 'full' },
    ];
    const cues = displayCues(shots, narr, {}, { subLang: 'English', canvasW: 1080 });
    expect(cues.length).toBeGreaterThanOrEqual(2);
    const subs = cues.map((cue) => cue.sub ?? '');
    expect(subs.every(Boolean)).toBe(true);
    // Every translated word appears exactly once across the sentence's cues, in order.
    expect(subs.join(' ').split(/\s+/)).toEqual(narr[0]!.sub!.split(' '));
  });

  it('shows a split sentence\'s per-stretch translations only under their own stretch', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({ text: `词${i}`, start: i * 0.5, end: i * 0.5 + 0.4 }));
    const other = [{ text: '别的', start: 10.2, end: 10.8 }, { text: '话。', start: 11, end: 11.6 }];
    const narr: AsrSegment[] = [
      { start: 0, end: 10, text: words.map((w) => w.text).join(''), words, subLang: 'English', cueSubs: { '0:7': 'first stretch here', '12:19': 'second stretch there' } },
      { start: 10.2, end: 11.6, text: '别的话。', words: other, subLang: 'English', sub: 'Something else.' },
    ];
    // Reordered: the other sentence plays between the two pieces of the first.
    const shots: VideoShot[] = [
      // The first stretch spans two back-to-back shots with a cut between them.
      { id: 'a1', srcStart: 0, srcEnd: 2, treatment: 'full' },
      { id: 'a2', srcStart: 2.6, srcEnd: 4, treatment: 'full' },
      { id: 'c', srcStart: 10, srcEnd: 12, treatment: 'full' },
      { id: 'b', srcStart: 6, srcEnd: 10, treatment: 'full' },
    ];
    const cues = displayCues(shots, narr, {}, { subLang: 'English', canvasW: 1080 });
    const joined = (from: number, to: number) => cues.filter((cue) => cue.start >= from && cue.start < to).map((cue) => cue.sub ?? '').join(' ').trim();
    // a1 + a2 play 0–3.4s, c 3.4–5.4s, b 5.4–9.4s.
    expect(joined(0, 3.4)).toBe('first stretch here');
    expect(joined(3.4, 5.4)).toBe('Something else.');
    expect(joined(5.4, 10)).toBe('second stretch there');
  });
});

describe('distributeSub', () => {
  it('splits by each cue\'s share of the source and gives every cue at least one word', () => {
    const pieces = distributeSub('A gift sent by GeekTime, we will use it to draw a prize for everyone.', [7, 6, 8]);
    expect(pieces).toHaveLength(3);
    expect(pieces.every((piece) => piece.length > 0)).toBe(true);
    expect(pieces.join(' ')).toBe('A gift sent by GeekTime, we will use it to draw a prize for everyone.');
  });

  it('prefers to break right after punctuation near the proportional point', () => {
    const [first] = distributeSub('Worth 34,800 yuan, oh, inside is an annual pass.', [6, 10]);
    expect(first).toMatch(/,$/);
  });

  it('keeps a single cue whole and leaves extra cues empty when words run out', () => {
    expect(distributeSub('Hello there.', [3])).toEqual(['Hello there.']);
    expect(distributeSub('Hi', [1, 1, 1])).toEqual(['Hi', '', '']);
  });
});
