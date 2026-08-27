import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadLocalFontFamilies,
  registeredLocalFontFace,
  supportsLocalFontAccess,
} from './local-font-access';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local font access', () => {
  it('loads every granted family, deduplicates faces and prefers the regular export face', async () => {
    const regular = {
      family: 'Demo Sans', fullName: 'Demo Sans Regular', postscriptName: 'DemoSans-Regular', style: 'Regular',
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'font/ttf' }),
    };
    const bold = {
      family: 'Demo Sans', fullName: 'Demo Sans Bold', postscriptName: 'DemoSans-Bold', style: 'Bold',
      blob: async () => new Blob([new Uint8Array([4, 5, 6])], { type: 'font/ttf' }),
    };
    vi.stubGlobal('window', { queryLocalFonts: vi.fn(async () => [bold, regular]) });

    expect(supportsLocalFontAccess()).toBe(true);
    await expect(loadLocalFontFamilies()).resolves.toEqual([{ family: 'Demo Sans', faceCount: 2 }]);
    expect(registeredLocalFontFace('Demo Sans')).toBe(regular);
  });
});
