import { describe, expect, it } from 'vitest';
import { localImageLocator, localImageLocatorSigs, parseLocalImageLocator } from './local-asset-locator';

describe('device-local image locators', () => {
  it('round-trips signatures with spaces, colons and CJK', () => {
    const sig = "本地图 (final)' 1.png:2048:1786500000000";
    expect(parseLocalImageLocator(localImageLocator(sig))).toBe(sig);
  });

  it('extracts unique locators from persisted custom markup', () => {
    const a = localImageLocator("a's (final).png:10:1");
    const b = localImageLocator('b.jpg:20:2');
    expect(localImageLocatorSigs(`<img src="${a}"><img src='${a}'><div style="background:url(${b})"></div>`)).toEqual([
      "a's (final).png:10:1",
      'b.jpg:20:2',
    ]);
  });

  it('rejects malformed or unrelated values', () => {
    expect(parseLocalImageLocator('https://cdn.example/image.png')).toBeNull();
    expect(parseLocalImageLocator('pireel-local-image:%E0%A4%A')).toBeNull();
  });
});
