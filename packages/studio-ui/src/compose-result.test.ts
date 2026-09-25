import { describe, expect, it } from 'vitest';
import { newBlockComposeMode } from './compose-result';

describe('new block compose routing', () => {
  it('tries the component library first without a Frame, and writes bespoke markup under a Frame', () => {
    expect(newBlockComposeMode({ frameAttached: false })).toEqual({ kit: true });
    expect(newBlockComposeMode({ frameAttached: true })).toBeUndefined();
  });
});
