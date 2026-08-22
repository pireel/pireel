import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { localAssetMentionId } from './chat-local-asset-mention';

const idShapedKey = (key: string) =>
  key === 'id'
  || key === 'ids'
  || key === 'output_id'
  || key.endsWith('Id')
  || key.endsWith('Ids');

const stripAt = (value: string) => value.startsWith('@') ? value.slice(1) : value;

/** Resolve one user-visible local @ token without confusing ordinary project asset ids with file
 * signatures. A real filename is allowed to begin with @; only an exact known mention id maps. */
function localSigOf(value: string, sigByMentionId: ReadonlyMap<string, string>): string {
  const trimmed = value.trim();
  const withoutScheme = trimmed.startsWith('local:') ? trimmed.slice('local:'.length) : trimmed;
  return sigByMentionId.get(stripAt(withoutScheme)) ?? withoutScheme;
}

function normalizeValue(
  value: unknown,
  key: string | undefined,
  sigByMentionId: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') {
    if (key === 'localSig' || key === 'sig' || key === 'refs') return localSigOf(value, sigByMentionId);
    return key && idShapedKey(key) ? stripAt(value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, key, sigByMentionId));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      normalizeValue(childValue, childKey, sigByMentionId),
    ]),
  );
}

/** One normalization boundary for every chat/MCP tool call. Tools receive canonical project ids or
 * exact local sigs and never need their own @-pill compatibility branch. */
export function normalizeStudioToolInputReferences(
  toolId: string,
  input: Record<string, unknown>,
  localAssets: readonly LocalAssetIndexEntry[],
): Record<string, unknown> {
  const sigByMentionId = new Map(localAssets.map((entry) => [localAssetMentionId(entry.sig), entry.sig]));
  const normalized = normalizeValue(input, undefined, sigByMentionId) as Record<string, unknown>;
  if (toolId === 'read_script' || toolId === 'extract_asr' || toolId === 'analyze_visual') {
    const assetId = typeof normalized.assetId === 'string' ? normalized.assetId : '';
    const localSig = sigByMentionId.get(assetId);
    if (localSig) {
      normalized.localSig = localSig;
      delete normalized.assetId;
    }
  }
  return normalized;
}
