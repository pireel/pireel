import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { emptyEditorDocumentV2 } from './editor-document';
import { migratePersistedProjectDocument } from './legacy-project-migration';
import { directorPlanFromDocument } from './director-plan-artifact';

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

  it('upgrades a nested Director Plan V1 without remigrating or losing the V2 timeline', () => {
    const document = emptyEditorDocumentV2();
    const legacyPlan = {
      version: 1,
      goal: 'Teach one durable idea.',
      creativeThesis: 'Evidence first, explanation second.',
      scenes: [{
        id: 'scene-1',
        label: 'Proof',
        startFrame: 0,
        durationFrames: 30,
        viewerTask: 'believe',
        narrativeRole: 'hook',
        sceneFamily: 'media-evidence',
        purpose: 'Establish trust.',
      }],
    };
    const migrated = migratePersistedProjectDocument({
      projectId: 'project-1',
      value: {
        ...document,
        semantics: { ...document.semantics, directorPlan: legacyPlan },
      },
    });

    expect(migrated.migrated).toBe(true);
    expect(migrated.issues).toEqual([]);
    expect(migrated.document.timeline).toEqual(document.timeline);
    expect(directorPlanFromDocument(migrated.document)).toMatchObject({
      goal: legacyPlan.goal,
      creativeThesis: legacyPlan.creativeThesis,
      rhythmArc: expect.any(String),
      designSystem: expect.objectContaining({ visualConcept: legacyPlan.creativeThesis }),
      scenes: [expect.objectContaining({ id: 'scene-1', brollDecision: 'none' })],
    });
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
        localAssets: [{ assetId: 'photo-asset', contentSig: 'photo.webp:42:7', sig: 'photo.webp:42:7', label: 'photo.webp', kind: 'image', createdAt: 7 }],
        media: { clips: { 'photo.webp:42:7': { key: 'studio/media/photo' } } },
      },
    });
    const placed = Object.values(migrated.document.assets).find((asset) => asset.label === 'photo.webp');
    expect(placed?.locator).toEqual({ localSig: 'photo.webp:42:7', cloudKey: 'studio/media/photo' });
    expect(placed?.library).toEqual({ createdAt: 7 });
    expect(migrated.document.semantics.plan).toEqual({ version: 1 });
  });
});
