import { describe, expect, it } from 'vitest';
import type { AudioClip } from './audio-tracks';
import { rippleInsertAudioClips, rippleRemoveAudioClips } from './timeline-ripple';

const clip = (id: string, startSec: number, inSec: number, outSec: number, speed = 1): AudioClip => ({
  id,
  src: `${id}.mp3`,
  durationSec: 30,
  startSec,
  inSec,
  outSec,
  speed,
  fadeInSec: 0.8,
  fadeOutSec: 1.5,
});

describe('legacy audio timeline ripple compatibility', () => {
  it('opens an insertion gap by shifting later clips and splitting straddlers', () => {
    const result = rippleInsertAudioClips([
      clip('before', 0, 0, 2),
      clip('spanning', 0, 0, 10),
      clip('after', 12, 0, 3),
    ], 5, 2);
    expect(result).toMatchObject([
      { id: 'before', startSec: 0, inSec: 0, outSec: 2 },
      { id: 'spanning', startSec: 0, inSec: 0, outSec: 5, fadeOutSec: 0 },
      { id: 'spanning~ripple-5000', startSec: 7, inSec: 5, outSec: 10, fadeInSec: 0 },
      { id: 'after', startSec: 14, inSec: 0, outSec: 3 },
    ]);
  });

  it('clears and closes a range across inside, head, tail and spanning clips', () => {
    const result = rippleRemoveAudioClips([
      clip('before', 0, 0, 2),
      clip('tail', 2, 0, 5),
      clip('inside', 5, 0, 2),
      clip('head', 6, 0, 5),
      clip('spanning', 0, 0, 12),
      clip('after', 12, 0, 3),
    ], 4, 8);
    expect(result).toMatchObject([
      { id: 'before', startSec: 0, inSec: 0, outSec: 2 },
      { id: 'tail', startSec: 2, inSec: 0, outSec: 2, fadeOutSec: 0 },
      { id: 'head', startSec: 4, inSec: 2, outSec: 5, fadeInSec: 0 },
      { id: 'spanning', startSec: 0, inSec: 0, outSec: 4, fadeOutSec: 0 },
      { id: 'spanning~ripple-8000', startSec: 4, inSec: 8, outSec: 12, fadeInSec: 0 },
      { id: 'after', startSec: 8, inSec: 0, outSec: 3 },
    ]);
    expect(result.some((item) => item.id === 'inside')).toBe(false);
  });

  it('uses playback speed when mapping timeline cuts back to source seconds', () => {
    const result = rippleRemoveAudioClips([clip('fast', 0, 2, 12, 2)], 1, 3);
    expect(result).toMatchObject([
      { id: 'fast', startSec: 0, inSec: 2, outSec: 4 },
      { id: 'fast~ripple-3000', startSec: 1, inSec: 8, outSec: 12 },
    ]);
  });

  it('can split unresolved audio without inventing a finite out point', () => {
    const unresolved: AudioClip = { id: 'remote', src: 'https://example.test/audio', startSec: 0, inSec: 2 };
    const result = rippleInsertAudioClips([unresolved], 3, 2);
    expect(result).toMatchObject([
      { id: 'remote', outSec: 5 },
      { id: 'remote~ripple-3000', startSec: 5, inSec: 5 },
    ]);
    expect(result[1]!.outSec).toBeUndefined();
  });
});
