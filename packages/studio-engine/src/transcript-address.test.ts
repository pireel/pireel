import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import type { VideoShot } from './composition';
import { listAddressedWords, resolveWordIds, wordRanges, wordRangesToEdited } from './transcript-address';

const main: AsrSegment[] = [
  {
    start: 0,
    end: 3,
    text: 'one two three',
    words: [
      { text: 'one', start: 0, end: 0.8 },
      { text: 'two', start: 0.85, end: 1.8 },
      { text: 'three', start: 2, end: 2.8 },
    ],
  },
];

describe('stable transcript word addressing', () => {
  it('ids are source-derived and do not renumber after an edited-timeline cut', () => {
    const uncut: VideoShot[] = [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }];
    const cut: VideoShot[] = [
      { id: 's2', srcStart: 0, srcEnd: 0.8, treatment: 'full' },
      { id: 's3', srcStart: 1.9, srcEnd: 3, treatment: 'full' },
    ];
    const a = listAddressedWords(uncut, main, {});
    const b = listAddressedWords(cut, main, {});
    expect('error' in a || 'error' in b).toBe(false);
    if ('error' in a || 'error' in b) return;
    expect(b.words.map((w) => w.id)).toEqual([a.words[0]!.id, a.words[2]!.id]);
  });

  it('unknown ids are explicit, selected words merge and map to every surviving occurrence', () => {
    const shots: VideoShot[] = [
      { id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' },
      { id: 's2', srcStart: 0, srcEnd: 3, treatment: 'full' },
    ];
    const listed = listAddressedWords(shots, main, {});
    if ('error' in listed) throw new Error(listed.error);
    const ids = listed.words.slice(0, 2).map((w) => w.id);
    const resolved = resolveWordIds(shots, main, {}, [...ids, 'word_stale']);
    expect(resolved.missing).toEqual(['word_stale']);
    const ranges = wordRanges(resolved.words);
    expect(ranges).toHaveLength(1);
    expect(wordRangesToEdited(shots, ranges)).toHaveLength(2);
  });

  it('word list is bounded and pageable without changing ids', () => {
    const shots: VideoShot[] = [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }];
    const first = listAddressedWords(shots, main, {}, { limit: 2 });
    const second = listAddressedWords(shots, main, {}, { offset: 2, limit: 2 });
    if ('error' in first || 'error' in second) throw new Error('unexpected word listing error');
    expect(first).toMatchObject({ total: 3, offset: 0, hasMore: true });
    expect(second).toMatchObject({ total: 3, offset: 2, hasMore: false });
    expect(new Set([...first.words, ...second.words].map((word) => word.id)).size).toBe(3);
  });
});
