import {
  legacyLocalAssetId,
  type LocalAssetIndexEntry,
} from '@pireel/studio-engine/project-dto';
import { localAssetMentionId } from './chat-local-asset-mention';

const idShapedKey = (key: string) =>
  key === 'id'
  || key === 'ids'
  || key === 'output_id'
  || key.endsWith('Id')
  || key.endsWith('Ids');

const stripAt = (value: string) => value.startsWith('@') ? value.slice(1) : value;

export const localAssetReference = (entry: Pick<LocalAssetIndexEntry, 'assetId'>): string =>
  `local:${entry.assetId}`;

function canonicalLocalAsset(entry: LocalAssetIndexEntry): LocalAssetIndexEntry | null {
  const legacy = entry as Partial<LocalAssetIndexEntry>;
  const contentSig = legacy.contentSig || legacy.sig;
  if (!contentSig) return null;
  return {
    ...entry,
    assetId: legacy.assetId || legacyLocalAssetId(legacy),
    contentSig,
    sig: contentSig,
  };
}

/** Resolve current asset ids, new mention tokens, and unambiguous legacy sig references. */
export function resolveLocalAssetReference(
  value: string,
  localAssets: readonly LocalAssetIndexEntry[],
): LocalAssetIndexEntry | null {
  const assets = localAssets
    .map(canonicalLocalAsset)
    .filter((entry): entry is LocalAssetIndexEntry => !!entry);
  const trimmed = value.trim();
  const withoutScheme = trimmed.startsWith('local:') ? trimmed.slice('local:'.length) : trimmed;
  const bare = stripAt(withoutScheme);
  const direct = assets.find((entry) => entry.assetId === bare || localAssetMentionId(entry.assetId) === bare);
  if (direct) return direct;
  const legacyMatches = assets.filter(
    (entry) => entry.contentSig === withoutScheme || localAssetMentionId(entry.contentSig) === bare,
  );
  return legacyMatches.length === 1 ? legacyMatches[0]! : null;
}

function localReferenceOf(value: string, localAssets: readonly LocalAssetIndexEntry[]): string {
  const resolved = resolveLocalAssetReference(value, localAssets);
  return resolved ? localAssetReference(resolved) : value.trim();
}

function normalizeValue(
  value: unknown,
  key: string | undefined,
  localAssets: readonly LocalAssetIndexEntry[],
): unknown {
  if (typeof value === 'string') {
    if (key === 'localSig' || key === 'sig' || key === 'refs') return localReferenceOf(value, localAssets);
    if (key && idShapedKey(key)) {
      const stripped = stripAt(value);
      const local = resolveLocalAssetReference(stripped, localAssets);
      return local?.assetId ?? stripped;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, key, localAssets));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      normalizeValue(childValue, childKey, localAssets),
    ]),
  );
}

/** One normalization boundary for every chat/MCP tool call. Tools receive canonical project ids;
 * legacy local signatures are resolved here and never need their own @-pill compatibility branch. */
export function normalizeStudioToolInputReferences(
  toolId: string,
  input: Record<string, unknown>,
  localAssets: readonly LocalAssetIndexEntry[],
  registeredAssetIdByLocalAssetId: ReadonlyMap<string, string> = new Map(),
): Record<string, unknown> {
  const normalized = normalizeValue(input, undefined, localAssets) as Record<string, unknown>;
  if (toolId === 'register_media' && Array.isArray(normalized.assets)) {
    normalized.assets = normalized.assets.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const asset = value as Record<string, unknown>;
      const byId = typeof asset.id === 'string'
        ? resolveLocalAssetReference(asset.id, localAssets)
        : null;
      const bySig = typeof asset.localSig === 'string'
        ? resolveLocalAssetReference(asset.localSig, localAssets)
        : null;
      const local = byId ?? bySig;
      if (!local) return asset;
      return {
        ...asset,
        ...(byId ? { id: local.assetId } : {}),
        kind: asset.kind ?? local.kind ?? 'video',
        localSig: local.contentSig,
        ...(asset.label === undefined && local.label ? { label: local.label } : {}),
        ...(asset.width === undefined && local.w ? { width: local.w } : {}),
        ...(asset.height === undefined && local.h ? { height: local.h } : {}),
      };
    });
  }
  if (toolId === 'read_script' || toolId === 'extract_asr' || toolId === 'analyze_visual') {
    const assetId = typeof normalized.assetId === 'string' ? normalized.assetId : '';
    const fromAssetId = resolveLocalAssetReference(assetId, localAssets);
    const fromLocalSig = typeof normalized.localSig === 'string'
      ? resolveLocalAssetReference(normalized.localSig, localAssets)
      : null;
    const localAsset = fromAssetId ?? fromLocalSig;
    if (localAsset) {
      const registeredAssetId = registeredAssetIdByLocalAssetId.get(localAsset.assetId);
      if (registeredAssetId) normalized.assetId = registeredAssetId;
      else normalized.localAssetId = localAsset.assetId;
      delete normalized.localSig;
      if (!registeredAssetId) delete normalized.assetId;
    }
  }
  return normalized;
}
