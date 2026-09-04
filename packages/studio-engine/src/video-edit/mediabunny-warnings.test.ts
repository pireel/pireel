import { describe, expect, it, vi } from 'vitest';
import { installMediaBunnyWarningFilter } from './mediabunny-warnings';

describe('installMediaBunnyWarningFilter', () => {
  it('lets one notice per unsupported codec through and mutes the repeats, leaving other warnings alone', () => {
    const warn = vi.fn();
    const target = { warn };
    installMediaBunnyWarningFilter(target);
    installMediaBunnyWarningFilter(target); // idempotent
    target.warn("Unsupported audio codec (sample entry type 'apac').");
    target.warn("Unsupported audio codec (sample entry type 'apac').");
    target.warn("Unsupported audio codec (sample entry type 'apac').");
    target.warn("Unsupported audio codec (sample entry type 'lpcm').");
    target.warn('something else', { detail: 1 });
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[0]![0]).toContain("'apac'");
    expect(warn.mock.calls[0]![0]).toContain('muted');
    expect(warn.mock.calls[1]![0]).toContain("'lpcm'");
    expect(warn.mock.calls[2]).toEqual(['something else', { detail: 1 }]);
  });
});
