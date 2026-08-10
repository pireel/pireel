import { describe, expect, it } from 'vitest';
import { newBlockComposeMode } from './compose-result';

describe('new block compose routing', () => {
  it('uses bespoke markup for every new element, including a small edit without a Frame', () => {
    expect(newBlockComposeMode()).toBeUndefined();
  });
});
