import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';

export type FolderSource = NonNullable<LocalAssetIndexEntry['folder']>;

export interface FolderRestoreGroup {
  folder: FolderSource;
  entries: LocalAssetIndexEntry[];
}

/** Reconcile the browser cache with the project index. Before cloud hydration the union keeps the
 * UI useful offline. Once hydration confirms a cloud index (including an explicit empty array),
 * the cloud is authoritative so a deletion made in another browser cannot be resurrected here. */
export function reconcileLocalAssetRegistry(
  local: LocalAssetIndexEntry[],
  cloud: LocalAssetIndexEntry[] | undefined,
  syncReady: boolean,
): LocalAssetIndexEntry[] {
  if (syncReady && cloud !== undefined) {
    return [...new Map(cloud.map((entry) => [entry.sig, entry])).values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  const bySig = new Map((cloud ?? []).map((entry) => [entry.sig, entry]));
  for (const entry of local) bySig.set(entry.sig, entry);
  return [...bySig.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Folder pickers must start from the trusted click itself. Radix emits `onSelect` from a
 * follow-up custom event, which embedded browsers may no longer treat as a file-picker gesture. */
export function folderImportTriggerProps(onImport: () => void): { onClickCapture: () => void } {
  return { onClickCapture: onImport };
}

/** The portable folder picker path. Embedded browsers can expose showDirectoryPicker while failing
 * to bridge its native dialog; a webkitdirectory input uses the ordinary file-chooser bridge. */
export function triggerFolderInput(input: Pick<HTMLInputElement, 'click'> | null | undefined): boolean {
  if (!input) return false;
  input.click();
  return true;
}

/** Registry presence is not hydration. A cancelled async pass must retry every entry that still
 * lacks a live object URL, even when the cloud/local registry contents themselves are unchanged. */
export function pendingLocalAssetEntries<T extends { sig: string }>(entries: T[], linkedSigs: ReadonlySet<string>): T[] {
  return entries.filter((entry) => !linkedSigs.has(entry.sig));
}

/** Folder imports retain one logical folder id in the cloud-safe index. When its local root
 * authorization is unavailable, collapse every missing child into one recovery affordance. */
export function groupFolderRestoreEntries(entries: LocalAssetIndexEntry[]): FolderRestoreGroup[] {
  const groups = new Map<string, FolderRestoreGroup>();
  for (const entry of entries) {
    if (!entry.folder) continue;
    const group = groups.get(entry.folder.id);
    if (group) group.entries.push(entry);
    else groups.set(entry.folder.id, { folder: entry.folder, entries: [entry] });
  }
  return [...groups.values()];
}
