import { normalizeProjectOutputs, type StudioProjectOutputs } from './project-outputs';

/** Increment only for destructive editor-context migrations that require stale tabs to reload. */
export const STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION = 3;

/** Metadata-only index of one project-local asset. The original bytes stay on the user's device;
 * syncing this record lets every deliverable and browser render the same project media library. */
export interface LocalAssetIndexEntry {
  /** Stable logical identity inside the project. Chat/timeline references use this, never a path. */
  assetId: string;
  /** Content identity used only for byte validation, cache reuse and cloud deduplication. */
  contentSig: string;
  /** @deprecated Compatibility mirror for schema-v3 clients deployed before assetId existed. */
  sig: string;
  label: string;
  /** Absent on legacy entries = video. */
  kind?: 'video' | 'image' | 'audio';
  w?: number | null;
  h?: number | null;
  folder?: {
    id: string;
    name: string;
    path: string;
  };
  createdAt: number;
}

/** Project-level state that is intentionally outside any one V2 timeline. */
export interface StudioProjectContext {
  schemaVersion: typeof STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION;
  outputs?: StudioProjectOutputs;
  /** Shared media-library directory. A deliverable document only keeps assets it actually uses. */
  localAssets?: LocalAssetIndexEntry[];
}

interface LegacyLocalAssetIdentity {
  assetId?: unknown;
  contentSig?: unknown;
  sig?: unknown;
  folder?: unknown;
  createdAt?: unknown;
}

const safeIdentityPart = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** Old indexes had only a content sig. Derive a stable logical id from synced metadata so every
 * device upgrades the same project entry identically. Project isolation lives outside this id;
 * device bindings are always keyed by projectId + assetId. */
export function legacyLocalAssetId(value: LegacyLocalAssetIdentity): string {
  const rawFolder = value.folder && typeof value.folder === 'object'
    ? value.folder as Record<string, unknown>
    : {};
  const source = JSON.stringify([
    safeIdentityPart(value.contentSig) || safeIdentityPart(value.sig),
    safeIdentityPart(rawFolder.id),
    safeIdentityPart(rawFolder.path),
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0,
  ]);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `local_${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

function sanitizeLocalAssets(value: unknown): LocalAssetIndexEntry[] {
  if (!Array.isArray(value)) return [];
  const out: LocalAssetIndexEntry[] = [];
  const seen = new Set<string>();
  const seenLegacyContent = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Partial<LocalAssetIndexEntry> & { sig?: unknown };
    const contentSig = typeof entry.contentSig === 'string' && entry.contentSig
      ? entry.contentSig
      : typeof entry.sig === 'string' && entry.sig
        ? entry.sig
        : '';
    if (!contentSig) continue;
    const hasAssetId = typeof entry.assetId === 'string' && !!entry.assetId;
    if (!hasAssetId && seenLegacyContent.has(contentSig)) continue;
    const assetId = hasAssetId
      ? entry.assetId!.slice(0, 200)
      : legacyLocalAssetId(entry);
    if (!assetId || seen.has(assetId)) continue;
    const kind = entry.kind === 'video' || entry.kind === 'image' || entry.kind === 'audio' ? entry.kind : undefined;
    const rawFolder = entry.folder;
    const folder = rawFolder
      && typeof rawFolder.id === 'string' && rawFolder.id
      && typeof rawFolder.name === 'string' && rawFolder.name
      && typeof rawFolder.path === 'string' && rawFolder.path
      ? { id: rawFolder.id, name: rawFolder.name, path: rawFolder.path }
      : undefined;
    seen.add(assetId);
    if (!hasAssetId) seenLegacyContent.add(contentSig);
    out.push({
      assetId,
      contentSig,
      sig: contentSig,
      label: typeof entry.label === 'string' && entry.label ? entry.label : contentSig,
      ...(kind ? { kind } : {}),
      ...(typeof entry.w === 'number' || entry.w === null ? { w: entry.w } : {}),
      ...(typeof entry.h === 'number' || entry.h === null ? { h: entry.h } : {}),
      ...(folder ? { folder } : {}),
      createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
    });
  }
  return out.sort((left, right) => right.createdAt - left.createdAt);
}

export function sanitizeProjectContext(value: unknown): StudioProjectContext {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
    ...(record.outputs ? { outputs: normalizeProjectOutputs(record.outputs) } : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'localAssets')
      ? { localAssets: sanitizeLocalAssets(record.localAssets) }
      : {}),
  };
}

export function isProjectContextInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every((key) => key === 'schemaVersion' || key === 'outputs' || key === 'localAssets')
    && record.schemaVersion === STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION;
}
