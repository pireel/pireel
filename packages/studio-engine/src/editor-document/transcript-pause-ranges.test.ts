import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './index';
import { pausesLeftInEdit, spineSlivers, transcriptPauseRanges } from './narration-cut-planner';

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

describe('spineSlivers', () => {
  const build = (clips: Array<[number, number]>, words = [word('这是', 0, 1), word('做。', 1.6, 2), word('最后', 5, 5.6), word('一句', 5.7, 6.5)]) => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics.transcripts.talk = [segment(words)] as never;
    let frame = 0;
    document.timeline.tracks[0]!.clips = clips.map(([sourceInSec, sourceOutSec], index) => {
      const durationFrames = Math.round((sourceOutSec - sourceInSec) * 30);
      const clip = { id: `c${index}`, kind: 'narrative', assetId: 'talk', startFrame: frame, durationFrames, enabled: true, sourceInSec, sourceOutSec, properties: { treatment: 'full' } };
      frame += durationFrames;
      return clip;
    }) as never;
    return document;
  };

  it('finds what two cuts left between them: the tail of a word, a frame of nothing', () => {
    // 0–1 plays; the tail of "做。" (1.97–2.0) and an empty instant (3.0–3.1) are left between cuts; 5–6.5 plays.
    expect(spineSlivers(build([[0, 1], [1.97, 2], [3, 3.1], [5, 6.5]]))).toEqual([
      { clipId: 'c1', startFrame: 30, endFrame: 31 },
      { clipId: 'c2', startFrame: 31, endFrame: 34 },
    ]);
  });

  it('leaves a short clip that plays a whole word, and one that continues its neighbour', () => {
    // "做。" whole, between two cuts: it is speech, however short.
    expect(spineSlivers(build([[0, 1], [1.58, 2.02], [5, 6.5]]))).toEqual([]);
    // A split made on purpose: 5.6–5.7 continues 5–5.6 and runs on into 5.7–6.5.
    expect(spineSlivers(build([[0, 1], [5, 5.6], [5.6, 5.7], [5.7, 6.5]]))).toEqual([]);
  });

  it('judges nothing without word timing', () => {
    const document = build([[0, 1], [1.97, 2], [5, 6.5]]);
    document.semantics.transcripts.talk = [{ start: 0, end: 6.5, text: 'no word timing' }] as never;
    expect(spineSlivers(document)).toEqual([]);
  });
});
