import { describe, expect, it } from 'vitest';
import { newBlockComposeMode } from './compose-result';

describe('new block compose routing', () => {
  it('uses bespoke markup for a theme or a Director Plan scene', () => {
    expect(newBlockComposeMode({ hasFrame: true, hasDirectorScene: false })).toBeUndefined();
    expect(newBlockComposeMode({ hasFrame: false, hasDirectorScene: true })).toBeUndefined();
  });

  it('keeps kit as the small themeless local-edit fallback only', () => {
    expect(newBlockComposeMode({ hasFrame: false, hasDirectorScene: false })).toEqual({ kit: true });
  });
});
