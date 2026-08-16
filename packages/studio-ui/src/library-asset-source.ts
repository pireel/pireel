import {
  type MediaRef,
  parseLocalImageLocator,
} from '@pireel/studio-engine/composition';

type LibraryAssetSource = Pick<MediaRef, 'type' | 'url'>;

/** A persisted local-image locator is a byte identity, not a fetchable URL. */
export function localImageSigFromLibraryAsset(
  asset: LibraryAssetSource,
): string | null {
  return asset.type === 'image' ? parseLocalImageLocator(asset.url) : null;
}

/** Prevent document-local sources from falling through to the server media proxy. */
export function isDeviceLocalLibraryAsset(
  asset: LibraryAssetSource,
): boolean {
  return /^(?:blob|data):/i.test(asset.url)
    || localImageSigFromLibraryAsset(asset) !== null;
}
