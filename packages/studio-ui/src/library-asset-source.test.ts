import { describe, expect, it } from 'vitest';
import {
  isDeviceLocalLibraryAsset,
  localImageSigFromLibraryAsset,
} from './library-asset-source';

describe('library asset sources', () => {
  it('decodes a persisted local image locator before timeline insertion', () => {
    const sig = '12f899b6a502466acec7a06cd035eea1.jpg:133177:1786688604450';
    const asset = {
      type: 'image' as const,
      url: 'pireel-local-image:12f899b6a502466acec7a06cd035eea1.jpg%3A133177%3A1786688604450',
    };

    expect(localImageSigFromLibraryAsset(asset)).toBe(sig);
    expect(isDeviceLocalLibraryAsset(asset)).toBe(true);
  });

  it('does not treat remote media or a video with an image locator as a local image', () => {
    expect(isDeviceLocalLibraryAsset({ type: 'image', url: 'https://cdn.example.com/photo.jpg' })).toBe(false);
    expect(localImageSigFromLibraryAsset({ type: 'video', url: 'pireel-local-image:photo.jpg%3A1%3A2' })).toBeNull();
  });

  it('keeps browser object and data URLs on the device-local path', () => {
    expect(isDeviceLocalLibraryAsset({ type: 'image', url: 'blob:http://localhost/photo' })).toBe(true);
    expect(isDeviceLocalLibraryAsset({ type: 'image', url: 'data:image/png;base64,AA==' })).toBe(true);
  });
});
