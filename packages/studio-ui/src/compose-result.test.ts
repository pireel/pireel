import { describe, expect, it } from 'vitest';
import { newBlockComposeMode } from './compose-result';

describe('new block compose routing', () => {
  it('tries the component library first without brand graphics, and writes bespoke markup with them', () => {
    expect(newBlockComposeMode({ brandGraphics: false })).toEqual({ kit: true });
    expect(newBlockComposeMode({ brandGraphics: true })).toBeUndefined();
  });
});
