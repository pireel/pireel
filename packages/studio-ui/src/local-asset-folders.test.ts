import { describe, expect, it } from 'vitest';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';
import {
  folderImportTriggerProps,
  groupFolderRestoreEntries,
  pendingLocalAssetEntries,
  reconcileLocalAssetRegistry,
  renameLocalAssetEntry,
  triggerFolderInput,
} from './local-asset-folders';

const entry = (sig: string, folderId?: string, path = sig): LocalAssetIndexEntry => ({
  sig,
  label: sig,
  kind: 'image',
  createdAt: 1,
  ...(folderId ? { folder: { id: folderId, name: `${folderId}-name`, path } } : {}),
});

describe('local folder recovery', () => {
  it('treats a hydrated cloud index as authoritative for cross-browser additions and deletions', () => {
    const staleLocal = [entry('deleted.png:1:1')];
    const remoteAdded = entry('added.png:2:2');

    expect(reconcileLocalAssetRegistry(staleLocal, [], true)).toEqual([]);
    expect(reconcileLocalAssetRegistry([], [remoteAdded], true)).toEqual([remoteAdded]);
  });

  it('keeps the local cache while the cloud index is not known yet', () => {
    const cached = [entry('offline.png:1:1')];

    expect(reconcileLocalAssetRegistry(cached, undefined, true)).toEqual(cached);
  });

  it('collapses every missing child from one imported folder into one recovery group', () => {
    const groups = groupFolderRestoreEntries([
      entry('a.png:1:1', 'folder-a', 'a.png'),
      entry('b.png:2:2', 'folder-a', 'nested/b.png'),
      entry('c.png:3:3', 'folder-b', 'c.png'),
      entry('legacy.png:4:4'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.folder.id).toBe('folder-a');
    expect(groups[0]?.entries.map((item) => item.sig)).toEqual(['a.png:1:1', 'b.png:2:2']);
    expect(groups[1]?.entries).toHaveLength(1);
  });

  it('opens the folder picker during the trusted click capture, before dropdown selection', () => {
    let opened = 0;
    const trigger = folderImportTriggerProps(() => {
      opened += 1;
    });

    expect(trigger.onClickCapture).toBeTypeOf('function');
    expect('onSelect' in trigger).toBe(false);
    trigger.onClickCapture();
    expect(opened).toBe(1);
  });

  it('triggers the portable directory input directly', () => {
    let clicks = 0;
    const input = { click: () => { clicks += 1; } };

    expect(triggerFolderInput(input)).toBe(true);
    expect(clicks).toBe(1);
    expect(triggerFolderInput(null)).toBe(false);
  });

  it('retries unchanged registry entries that a cancelled hydration pass never linked', () => {
    const entries = [entry('loaded.png:1:1'), entry('still-pending.png:2:2')];

    expect(pendingLocalAssetEntries(entries, new Set(['loaded.png:1:1'])).map((item) => item.sig)).toEqual([
      'still-pending.png:2:2',
    ]);
  });

  it('renames only display metadata without changing the local file identity', () => {
    const original = entry('product.mov:20:3', 'folder-a', 'clips/product.mov');
    const renamed = renameLocalAssetEntry(
      [original, entry('other.mov:10:2')],
      original.sig,
      '  Product close-up and texture details  ',
    );

    expect(renamed[0]).toEqual({
      ...original,
      label: 'Product close-up and texture details',
    });
    expect(renamed[0]?.sig).toBe(original.sig);
    expect(renamed[0]?.folder).toEqual(original.folder);
    expect(renamed[1]?.label).toBe('other.mov:10:2');
  });

  it('rejects an empty semantic label', () => {
    const entries = [entry('product.mov:20:3')];
    expect(renameLocalAssetEntry(entries, entries[0]!.sig, '   ')).toBe(entries);
  });
});
