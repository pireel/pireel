import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirm = vi.hoisted(() => vi.fn(async () => false));
vi.mock('@pireel/ui/confirm', () => ({ confirm }));

import { creditsShortError, offerCreditsFor } from './credit-cost';
import { CreditsShort } from './current-user';

describe('credit shortfalls', () => {
  beforeEach(() => confirm.mockClear());

  it('turns a 402 into the plans dialog, and nothing else', () => {
    const short = creditsShortError('Not enough');
    expect(short).toBeInstanceOf(CreditsShort);
    expect(short.message).toBe('Not enough');
    expect(offerCreditsFor(short)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(offerCreditsFor(new Error('network'))).toBe(false);
    expect(offerCreditsFor('aborted')).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
