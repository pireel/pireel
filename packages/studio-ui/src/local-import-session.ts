import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { durableFileSig } from './media';
import { saveLocalStream, saveLocalVideo } from './local-media';

export type LocalAssetKind = 'video' | 'image' | 'audio';
export type LocalFolderSource = NonNullable<LocalAssetIndexEntry['folder']>;

const EXT_KIND: [RegExp, LocalAssetKind][] = [
  [/\.(mp4|mov|webm|m4v|mkv|avi)$/i, 'video'],
  [/\.(jpe?g|png|webp|gif|avif|bmp)$/i, 'image'],
  [/\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i, 'audio'],
];

/** MIME first, extension fallback: native pickers often return an empty MIME (notably for .mov). */
export function localAssetKindOf(
  file: Pick<File, 'name' | 'type'>,
): LocalAssetKind | null {
  for (const kind of ['video', 'image', 'audio'] as const) {
    if (file.type.startsWith(`${kind}/`)) return kind;
  }
  for (const [pattern, kind] of EXT_KIND)
    if (pattern.test(file.name)) return kind;
  return null;
}

export interface BrowserLocalImportSource {
  type: 'browser';
  file: File;
  handle?: FileSystemFileHandle;
  folder?: LocalFolderSource;
  assetId?: string;
}

export interface SkillLoopbackImportSource {
  type: 'skill-loopback';
  localUrl: string;
  sig: string;
  filename: string;
  fallbackType?: string;
  folder?: LocalFolderSource;
  assetId?: string;
}

export type LocalImportSource =
  | BrowserLocalImportSource
  | SkillLoopbackImportSource;

export interface ImportedLocalAsset {
  assetId: string;
  contentSig: string;
  file: File;
  /** @deprecated schema-v3 compatibility mirror of contentSig. */
  sig: string;
  label: string;
  kind: LocalAssetKind;
  folder?: LocalFolderSource;
  source: LocalImportSource['type'];
}

/** Uniqueness domain is one project's asset set (content identity travels via contentSig), so
 * 48 random bits are plenty. Kept deliberately SHORT: these ids are retyped by models in tool
 * calls, and transcription errors scale with id length. */
export function newLocalAssetId(): string {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(6));
  if (bytes) {
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    return `local_${value.toString(36).padStart(10, '0')}`;
  }
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/** The relay may tell the tab where to fetch, but it never grants general URL access. Keep this
 * capability deliberately narrow: the helper binds to this exact host and uses a random path. */
export function loopbackImportUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const token = url.pathname.slice(1);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9_-]{8,}$/.test(token)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

const expectedSizeFromSig = (sig: string): number | null => {
  const parts = sig.split(':');
  const size = Number(parts[parts.length - 2]);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
};

async function materialize(
  source: LocalImportSource,
): Promise<{ file: File; sig: string; persisted: boolean }> {
  if (source.type === 'browser')
    return {
      file: source.file,
      sig: await durableFileSig(source.file),
      persisted: false,
    };

  const url = loopbackImportUrl(source.localUrl);
  if (!url)
    throw new Error('local import URL must be a one-time 127.0.0.1 address');
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error(
      'local loopback is unreachable from this browser; open the Studio handoff in a browser that shares the agent host network and retry',
    );
  }
  if (!response.ok)
    throw new Error(`local fetch failed: HTTP ${response.status}`);
  if (!response.body)
    throw new Error('local fetch failed: response body is not streamable');

  const expectedSize = expectedSizeFromSig(source.sig);
  const responseType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim();
  const type =
    responseType || source.fallbackType || 'application/octet-stream';
  const sourceKind = localAssetKindOf({ name: source.filename, type });
  if (!sourceKind) {
    await response.body.cancel();
    throw new Error(`unsupported local media: ${source.filename}`);
  }
  const file = await saveLocalStream(response.body, source.sig, {
    name: source.filename || 'import',
    type,
    expectedSize,
    pinned: sourceKind === 'image' || Boolean(source.folder),
  });
  return { file, sig: source.sig, persisted: true };
}

/** Browser picker files and Skill loopback files converge here. Source permission/materialization is
 * adapter-specific; classification, OPFS/handle persistence and index entry creation are shared. */
export async function importLocalSource(
  source: LocalImportSource,
  projectId?: string,
): Promise<ImportedLocalAsset> {
  const { file, sig, persisted } = await materialize(source);
  const assetId = source.assetId || newLocalAssetId();
  const kind = localAssetKindOf(file);
  if (!kind) throw new Error(`unsupported local media: ${file.name}`);
  const handle = source.type === 'browser' ? source.handle : undefined;
  const folder = source.folder;
  if (!persisted) {
    const stored = await saveLocalVideo(file, sig, handle, {
      // Still images are small enough to keep durably and are rendered from several runtimes
      // (parent timeline + opaque preview iframe). Never make their availability depend only on a
      // native handle whose permission can fall back to "prompt" after a refresh.
      pinned: kind === 'image' || Boolean(folder && !handle),
      // A single-file handle keeps a bounded fallback. Images keep one even when they came from a
      // folder handle so a hot reload does not turn a valid clip into an unresolved locator.
      fallbackCopy: kind === 'image' || Boolean(handle && !folder),
      ...(projectId ? { binding: { projectId, assetId } } : {}),
    });
    if (!stored) {
      throw new Error('local media could not be persisted on this device');
    }
  }
  return {
    assetId,
    contentSig: sig,
    file,
    sig,
    label: file.name,
    kind,
    ...(folder ? { folder } : {}),
    source: source.type,
  };
}

export interface LocalImportSessionResult {
  imported: ImportedLocalAsset[];
  rejected: { source: LocalImportSource; error: string }[];
}

/** A batch is intentionally sequential: OPFS writes can be large and parallel writes cause memory
 * spikes in embedded browsers. One bad file does not abort the rest of the import session. */
export async function runLocalImportSession(
  sources: LocalImportSource[],
  projectId?: string,
): Promise<LocalImportSessionResult> {
  const imported: ImportedLocalAsset[] = [];
  const rejected: LocalImportSessionResult['rejected'] = [];
  for (const source of sources) {
    try {
      imported.push(await importLocalSource(source, projectId));
    } catch (error) {
      rejected.push({
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { imported, rejected };
}

export function localAssetIndexEntry(
  asset: ImportedLocalAsset,
  facts?: { width?: number | null; height?: number | null; createdAt?: number },
): LocalAssetIndexEntry {
  return {
    assetId: asset.assetId,
    contentSig: asset.contentSig,
    sig: asset.sig,
    label: asset.label,
    kind: asset.kind,
    w: facts?.width ?? null,
    h: facts?.height ?? null,
    ...(asset.folder ? { folder: asset.folder } : {}),
    createdAt: facts?.createdAt ?? Date.now(),
  };
}
