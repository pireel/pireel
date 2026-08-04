import type { AssetId, EditorAssetKind, EditorAssetLocator, EditorMediaAsset } from './types';

/** Small deterministic hash: ids need repeatability across retries, not cryptographic security. */
function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableId(prefix: string, projectId: string, identity: string): string {
  return `${prefix}_${stableHash(`${projectId}\u0000${identity}`)}`;
}

function cleanLocator(locator: EditorAssetLocator): EditorAssetLocator {
  return {
    ...(locator.localSig ? { localSig: locator.localSig } : {}),
    ...(locator.cloudKey ? { cloudKey: locator.cloudKey } : {}),
    ...(locator.remoteUrl ? { remoteUrl: locator.remoteUrl } : {}),
  };
}

function assetIdentity(kind: EditorAssetKind, locator: EditorAssetLocator, fallback: string): string {
  return `${kind}:${locator.localSig ? `sig:${locator.localSig}` : locator.cloudKey ? `cloud:${locator.cloudKey}` : locator.remoteUrl ? `url:${locator.remoteUrl}` : fallback}`;
}

function mergeAsset(into: EditorMediaAsset, patch: Omit<EditorMediaAsset, 'id'>): void {
  if (!into.label && patch.label) into.label = patch.label;
  into.locator = { ...into.locator, ...cleanLocator(patch.locator) };
  into.metadata = {
    ...into.metadata,
    ...Object.fromEntries(Object.entries(patch.metadata).filter(([, value]) => value != null)),
  };
}

export interface MigrationAssetRegistry {
  assets: Record<AssetId, EditorMediaAsset>;
  sourceToAssetId: Map<string, AssetId>;
  upsert(
    kind: EditorAssetKind,
    locator: EditorAssetLocator,
    fallback: string,
    patch: Omit<EditorMediaAsset, 'id' | 'kind' | 'locator'>,
  ): AssetId;
  findByLocalSig(sig: string): EditorMediaAsset | undefined;
}

export function createMigrationAssetRegistry(projectId: string): MigrationAssetRegistry {
  const assets: Record<AssetId, EditorMediaAsset> = {};
  const sourceToAssetId = new Map<string, AssetId>();
  const identityToAssetId = new Map<string, AssetId>();

  return {
    assets,
    sourceToAssetId,
    upsert(kind, locator, fallback, patch) {
      const clean = cleanLocator(locator);
      const identity = assetIdentity(kind, clean, fallback);
      const existing = identityToAssetId.get(identity);
      if (existing) {
        mergeAsset(assets[existing]!, { kind, locator: clean, ...patch });
        return existing;
      }
      const id = stableId(`asset_${kind}`, projectId, identity);
      assets[id] = { id, kind, locator: clean, ...patch };
      identityToAssetId.set(identity, id);
      if (clean.remoteUrl) sourceToAssetId.set(clean.remoteUrl, id);
      return id;
    },
    findByLocalSig(sig) {
      return Object.values(assets).find((asset) => asset.locator.localSig === sig);
    },
  };
}
