import { describe, expect, it } from 'vitest';
import { emptyComposition, type Composition } from './composition-core';
import { applyLayoutDocumentEdit } from './layout-document-edit';
import { normalizeProjectDocument, projectDocumentToLegacyComposition } from './project-document';

function layoutFixture(): { composition: Composition; document: ReturnType<typeof normalizeProjectDocument>['document'] } {
  const composition: Composition = {
    ...emptyComposition(),
    video: { url: 'blob:main', durationSec: 8 },
    shots: [{ id: 'main', srcStart: 0, srcEnd: 8, treatment: 'full' }],
    blocks: [
      { id: 'left-card', templateId: 'custom', slots: {}, startSec: 0, durationSec: 4, trackIndex: 2, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, contentBox: { x: 0, y: 0, w: 1, h: 1 }, fitScale: 0.8 },
      { id: 'right-card', templateId: 'custom', slots: {}, startSec: 1, durationSec: 4, trackIndex: 7, box: { x: 0.7, y: 0.1, w: 0.2, h: 0.2 } },
    ],
  };
  const document = normalizeProjectDocument({
    projectId: 'layout-test',
    value: composition,
    context: {},
    videoSig: 'main-sig',
  }).document;
  document.timeline.tracks.push({
    id: 'native-empty', type: 'graphics', muted: false, hidden: true, locked: false,
    syncLocked: false, stackOrder: 30, clips: [],
  });
  return { composition, document };
}

describe('native layout document edit', () => {
  it('atomically frames the shot and places overlays while retaining native lanes', () => {
    const { composition, document } = layoutFixture();
    const result = applyLayoutDocumentEdit({
      document,
      composition,
      layout: { layout: 'split-left-right', blockIds: ['left-card', 'right-card'], shotId: 'main', videoPosition: 'left' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const projected = projectDocumentToLegacyComposition({ projectId: 'layout-test', value: result.document });
    expect(projected.shots![0]).toMatchObject({ treatment: 'split-l', treatSize: 50, partnerBlockId: 'left-card' });
    expect(projected.blocks.map((block) => block.box)).toEqual([
      { x: 0.555, y: 0.075, w: 0.1825, h: 0.75 },
      { x: 0.7625, y: 0.075, w: 0.1825, h: 0.75 },
    ]);
    expect(projected.blocks[0]).not.toHaveProperty('contentBox');
    expect(projected.blocks[0]).not.toHaveProperty('fitScale');
    expect(result.document.timeline.tracks.find((track) => track.id === 'native-empty')).toMatchObject({
      hidden: true, syncLocked: false, stackOrder: 30, clips: [],
    });
  });

  it('returns the original document when any target overlay lane is locked', () => {
    const { composition, document } = layoutFixture();
    document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === 'right-card'))!.locked = true;
    const result = applyLayoutDocumentEdit({
      document,
      composition,
      layout: { layout: 'split-left-right', blockIds: ['left-card', 'right-card'], shotId: 'main' },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'main')).toMatchObject({
      kind: 'narrative', properties: { treatment: 'full' },
    });
  });

  it('rejects an unknown identity without publishing partial geometry', () => {
    const { composition, document } = layoutFixture();
    const result = applyLayoutDocumentEdit({
      document,
      composition,
      layout: { layout: 'grid', blockIds: ['left-card', 'missing'] },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'invalid-command', message: 'block not found: missing' } });
  });
});
