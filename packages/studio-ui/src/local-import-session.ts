import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import { fileSig } from './media';
import { alignFileToSig, saveLocalVideo } from './local-media';

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
}

export interface SkillLoopbackImportSource {
  type: 'skill-loopback';
  localUrl: string;
  sig: string;
  filename: string;
  fallbackType?: string;
  folder?: LocalFolderSource;
}

export type LocalImportSource =
  | BrowserLocalImportSource
  | SkillLoopbackImportSource;

export interface ImportedLocalAsset {
  file: File;
  sig: string;
  label: string;
  kind: LocalAssetKind;
  folder?: LocalFolderSource;
  source: LocalImportSource['type'];
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
): Promise<{ file: File; sig: string }> {
  if (source.type === 'browser')
    return { file: source.file, sig: fileSig(source.file) };

  const url = loopbackImportUrl(source.localUrl);
  if (!url)
    throw new Error('local import URL must be a one-time 127.0.0.1 address');
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new Error(`local fetch failed: HTTP ${response.status}`);
  const blob = await response.blob();
  const expectedSize = expectedSizeFromSig(source.sig);
  if (expectedSize != null && blob.size !== expectedSize) {
    throw new Error(
      `local fetch size mismatch: expected ${expectedSize}, received ${blob.size}`,
    );
  }
  const file = alignFileToSig(
    new File([blob], source.filename || 'import', {
      type: blob.type || source.fallbackType || 'application/octet-stream',
    }),
    source.sig,
  );
  return { file, sig: source.sig };
}

/** Browser picker files and Skill loopback files converge here. Source permission/materialization is
 * adapter-specific; classification, OPFS/handle persistence and index entry creation are shared. */
export async function importLocalSource(
  source: LocalImportSource,
): Promise<ImportedLocalAsset> {
  const { file, sig } = await materialize(source);
  const kind = localAssetKindOf(file);
  if (!kind) throw new Error(`unsupported local media: ${file.name}`);
  const handle = source.type === 'browser' ? source.handle : undefined;
  const folder = source.folder;
  await saveLocalVideo(file, sig, handle, {
    // Folder-input files have no reusable handle, so their OPFS copy is the source of truth.
    pinned: Boolean(folder && !handle),
    // A single-file handle also keeps a bounded OPFS fallback for embedded browser refreshes.
    fallbackCopy: Boolean(handle && !folder),
  });
  return {
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
): Promise<LocalImportSessionResult> {
  const imported: ImportedLocalAsset[] = [];
  const rejected: LocalImportSessionResult['rejected'] = [];
  for (const source of sources) {
    try {
      imported.push(await importLocalSource(source));
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
    sig: asset.sig,
    label: asset.label,
    kind: asset.kind,
    w: facts?.width ?? null,
    h: facts?.height ?? null,
    ...(asset.folder ? { folder: asset.folder } : {}),
    createdAt: facts?.createdAt ?? Date.now(),
  };
}
