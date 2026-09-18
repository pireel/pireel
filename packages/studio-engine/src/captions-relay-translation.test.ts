import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { displayCues } from './captions-relay';
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
});
