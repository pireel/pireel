import { describe, expect, it } from 'vitest';
import { emptyComposition, type Composition } from '@pireel/studio-engine/composition';
import { breaksCaptionLines } from './use-captions-ops';

const shown = (captionStyle: Composition['captionStyle']): Composition => ({ ...emptyComposition(), captionStyle });

describe('caption style changes that break lines again', () => {
  it('re-lays shown captions for a change to how much fits on a line', () => {
    const comp = shown({ on: true, preset: 'em-yellow', scale: 1 } as Composition['captionStyle']);
    for (const patch of [{ scale: .8 }, { font: 'serif' }, { bold: true }, { wPct: 60 }, { preset: 'art-beast' }, { bg: '#000000' }]) {
      expect(breaksCaptionLines(comp, patch)).toBe(true);
    }
  });
  it('leaves cues alone for colour, position and animation, an unchanged value, or captions that are off', () => {
    const comp = shown({ on: true, preset: 'em-yellow', scale: 1 } as Composition['captionStyle']);
    for (const patch of [{ color: '#ffffff' }, { yPct: 70 }, { xPct: 40 }, { animation: 'karaoke' as const }, { scale: 1 }]) {
      expect(breaksCaptionLines(comp, patch)).toBe(false);
    }
    expect(breaksCaptionLines(shown({ on: false, scale: 1 } as Composition['captionStyle']), { scale: .5 })).toBe(false);
  });
});
