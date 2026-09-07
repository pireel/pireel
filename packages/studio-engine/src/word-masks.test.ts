import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { displayCues } from './captions-relay';
import type { VideoShot } from './composition';
import { applyWordMasks, maskCueText, maskedAudioAt, maskedAudioRanges, patchWordMask } from './word-masks';

const sentence = (): AsrSegment => ({
  start: 0,
  end: 2,
  text: 'this is a damn good take',
  words: [
    { text: 'this', start: 0, end: 0.3 },
    { text: 'is', start: 0.3, end: 0.5 },
    { text: 'a', start: 0.5, end: 0.6 },
    { text: 'damn', start: 0.6, end: 0.9 },
    { text: 'good', start: 0.9, end: 1.2 },
    { text: 'take', start: 1.2, end: 2 },
  ],
});

describe('word masks', () => {
  it('patches audio and text independently and clears the entry when both are gone', () => {
    let seg = patchWordMask(sentence(), 3, { audio: 'beep' });
    expect(seg.masks).toEqual({ '3': { audio: 'beep' } });
    seg = patchWordMask(seg, 3, { text: '' });
    expect(seg.masks).toEqual({ '3': { audio: 'beep', text: '**' } });
    seg = patchWordMask(seg, 3, { audio: null });
    expect(seg.masks).toEqual({ '3': { text: '**' } });
    const cleared = patchWordMask(seg, 3, { text: null });
    expect(cleared.masks).toBeUndefined();
    expect(patchWordMask(cleared, 3, { audio: null })).toBe(cleared);
  });

  it('keeps the spoken transcript untouched', () => {
    const segs = applyWordMasks([sentence()], [{ sentenceIndex: 0, wordIndex: 3 }], { audio: 'mute', text: '***' });
    expect(segs[0]!.text).toBe('this is a damn good take');
    expect(segs[0]!.words![3]!.text).toBe('damn');
  });

  it('merges masked spans of the same kind and never invades an unmasked neighbour', () => {
    const segs = applyWordMasks([sentence()], [{ sentenceIndex: 0, wordIndex: 3 }, { sentenceIndex: 0, wordIndex: 4 }], { audio: 'beep' });
    const ranges = maskedAudioRanges(segs);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.audio).toBe('beep');
    // 'a' ends exactly where 'damn' starts: no padding leaks into it. 'take' starts where 'good' ends,
    // a shared ASR cut, so the span stops 60 ms before that boundary.
    expect(ranges[0]!.start).toBeCloseTo(0.6, 6);
    expect(ranges[0]!.end).toBeCloseTo(1.14, 6);
    expect(maskedAudioAt(ranges, 0.7)).toBe('beep');
    expect(maskedAudioAt(ranges, 0.55)).toBeNull();
    // With silence around the word, the padding is used
    const gapped: AsrSegment = { start: 0, end: 3, text: 'one damn two', words: [
      { text: 'one', start: 0, end: 0.4 }, { text: 'damn', start: 1, end: 1.4 }, { text: 'two', start: 2, end: 2.4 },
    ] };
    const padded = maskedAudioRanges(applyWordMasks([gapped], [{ sentenceIndex: 0, wordIndex: 1 }], { audio: 'mute' }));
    expect(padded[0]!.start).toBeCloseTo(0.96, 6);
    expect(padded[0]!.end).toBeCloseTo(1.44, 6);
    const mixed = applyWordMasks(segs, [{ sentenceIndex: 0, wordIndex: 4 }], { audio: 'mute' });
    expect(maskedAudioRanges(mixed).map((r) => r.audio)).toEqual(['beep', 'mute']);
  });

  it('masks the caption copy while keeping word timing', () => {
    const segs = applyWordMasks([sentence()], [{ sentenceIndex: 0, wordIndex: 3 }], { text: '**' });
    const shots: VideoShot[] = [{ id: 's1', srcStart: 0, srcEnd: 2 } as VideoShot];
    const cues = displayCues(shots, segs, {}, { canvasW: 1080 });
    const line = cues.map((cue) => cue.text).join(' ');
    expect(line).toContain('**');
    expect(line).not.toContain('damn');
    const masked = cues.flatMap((cue) => cue.words).find((word) => word.si === 3)!;
    expect(masked.text).toBe('**');
    expect(masked.start).toBeCloseTo(0.6, 3);
  });

  it('swaps only the masked word inside an edited cue line', () => {
    const seg = applyWordMasks([sentence()], [{ sentenceIndex: 0, wordIndex: 3 }], { text: '[bleep]' })[0]!;
    expect(maskCueText(seg, 'This is a damn good take!', 0, 5)).toBe('This is a [bleep] good take!');
    expect(maskCueText(seg, 'unrelated', 0, 5)).toBe('unrelated');
  });
});
