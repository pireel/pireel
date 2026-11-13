import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './index';
import { pausesLeftInEdit, transcriptPauseRanges } from './narration-cut-planner';

const word = (text: string, start: number, end: number) => ({ text, start, end });
const segment = (words: ReturnType<typeof word>[]) => ({ start: words[0]!.start, end: words.at(-1)!.end, text: words.map((entry) => entry.text).join(''), words });

describe('transcriptPauseRanges', () => {
  const settings = { minimumPauseSec: 0.4, speechPaddingSec: 0.15 };

  it('finds the gaps between words that last long enough, and leaves the words their air', () => {
    const ranges = transcriptPauseRanges([
      segment([word('one', 0.5, 1), word('two', 1.1, 1.6), word('three', 3.6, 4)]),
      segment([word('four', 4.3, 4.8), word('five', 10.8, 11.2)]),
    ], settings);
    // 1.6 → 3.6 and 4.8 → 10.8 are pauses; 1.0 → 1.1 and 4.0 → 4.3 are not.
    expect(ranges).toEqual([{ fromSec: 1.75, toSec: 3.45 }, { fromSec: 4.95, toSec: 10.65 }]);
  });

  it('does not cut before the first word or after the last, nor inside overlapping words', () => {
    expect(transcriptPauseRanges([segment([word('late', 5, 6)])], settings)).toEqual([]);
    // A long word that spans the next one's start leaves no gap after itself.
    expect(transcriptPauseRanges([segment([word('long', 0, 3), word('inside', 1, 1.2), word('next', 3.1, 3.5)])], settings)).toEqual([]);
  });

  it('reads a segment without word timings as one spoken stretch, and nothing from no transcript', () => {
    expect(transcriptPauseRanges([{ start: 0, end: 2, text: 'a' }, { start: 4, end: 6, text: 'b' }], settings)).toEqual([{ fromSec: 2.15, toSec: 3.85 }]);
    expect(transcriptPauseRanges([], settings)).toEqual([]);
  });

  it('drops a gap the padding leaves nothing of', () => {
    expect(transcriptPauseRanges([segment([word('a', 0, 1), word('b', 1.42, 2)])], { minimumPauseSec: 0.4, speechPaddingSec: 0.2 })).toEqual([]);
  });
});

describe('pausesLeftInEdit', () => {
  const build = (clips: Array<[number, number]>) => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics.transcripts.talk = [segment([word('a', 0, 1), word('b', 3, 4), word('c', 4.2, 5), word('d', 11, 12)])] as never;
    let frame = 0;
    document.timeline.tracks[0]!.clips = clips.map(([sourceInSec, sourceOutSec], index) => {
      const durationFrames = Math.round((sourceOutSec - sourceInSec) * 30);
      const clip = { id: `c${index}`, kind: 'narrative', assetId: 'talk', startFrame: frame, durationFrames, enabled: true, sourceInSec, sourceOutSec, properties: { treatment: 'full' } };
      frame += durationFrames;
      return clip;
    }) as never;
    return document;
  };

  it('counts the pauses between words that still play in one clip', () => {
    expect(pausesLeftInEdit(build([[0, 12]]), 'talk', 0.8)).toEqual({ count: 2, totalSec: 8, longestSec: 6 });
  });

  it('does not count a pause that a cut took out', () => {
    // The 1 → 3 pause is trimmed to a breath, and the 5 → 11 one is cut out whole.
    expect(pausesLeftInEdit(build([[0, 1.2], [2.8, 5.2], [10.8, 12]]), 'talk', 0.8)).toEqual({ count: 0, totalSec: 0, longestSec: 0 });
  });
});
