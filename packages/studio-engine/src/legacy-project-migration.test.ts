import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { migratePersistedProjectDocument } from './legacy-project-migration';

describe('one-shot persisted project migration', () => {
  it('converts a V1 row into V2 deterministically', () => {
    const legacy = {
      ...emptyComposition(),
      video: { url: 'blob:main', durationSec: 4, sourceWidth: 1920, sourceHeight: 1080 },
      shots: [{ id: 'talk', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
    };
    const migrated = migratePersistedProjectDocument({ projectId: 'project-1', value: legacy, videoSig: 'video-sig' });
    expect(migrated.migrated).toBe(true);
    expect(migrated.issues).toEqual([]);
    expect(migrated.document.version).toBe(2);
    expect(Object.values(migrated.document.assets)[0]!.locator).toEqual({ localSig: 'video-sig' });
  });

  it('does not trust a version marker without the complete V2 structure', () => {
    const migrated = migratePersistedProjectDocument({ projectId: 'project-1', value: { version: 2 } });
    expect(migrated.migrated).toBe(true);
    expect(migrated.document.version).toBe(2);
    expect(migrated.issues).toEqual([]);
  });

  it('folds retired context into V2 assets and clears the need for a runtime shadow', () => {
    const migrated = migratePersistedProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        blocks: [{
          id: 'local-image', templateId: 'media',
          slots: { media: { type: 'image', url: 'data:image/webp;base64,runtime' } },
          startSec: 0, durationSec: 2, trackIndex: 1, label: 'photo.webp',
        }],
      },
      context: {
        plan: { version: 1 },
        localAssets: [{ sig: 'photo.webp:42:7', label: 'photo.webp', kind: 'image', createdAt: 7 }],
        media: { clips: { 'photo.webp:42:7': { key: 'studio/media/photo' } } },
      },
    });
    const placed = Object.values(migrated.document.assets).find((asset) => asset.label === 'photo.webp');
    expect(placed?.locator).toEqual({ localSig: 'photo.webp:42:7', cloudKey: 'studio/media/photo' });
    expect(placed?.library).toEqual({ createdAt: 7 });
    expect(migrated.document.semantics.plan).toEqual({ version: 1 });
  });
});
