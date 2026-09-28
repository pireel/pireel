import { expect, it } from 'vitest';
import { pipRenderModel } from './pip-render-model';
import { PIP_TEMPLATES, resolvePipGeometry } from '@pireel/studio-engine/pip-layout';
import { validateEditorDocumentV2 } from '@pireel/studio-engine/editor-document/validation';
import type { CaptionTaskRecord } from './caption-task-store';
const fixture = (): CaptionTaskRecord => ({ id: 'pip', scope: 'owner', scene: 'pip', name: 'speaker.mp4', sourceSig: 'source', width: 1080, height: 1920, durationSec: 10, stage: 'ready', updatedAt: 1,
  options: { presetId: 'clean', aspect: 'original', shortenPauses: false, broll: { captions: false, pip: { template: 'presenter' }, assets: [{ id: 'a', sig: 'picture', name: 'picture.jpg', width: 1920, height: 1080, kind: 'image', durationSec: 5 }] } },
  broll: { analysisKey: 'key', planKey: 'plan', candidates: [{ id: 'candidate', assetId: 'a', start: 0, end: 5, description: 'picture' }], placements: [{ id: 'clip', candidateId: 'candidate', start: 2, duration: 3 }] },
});
for (const template of PIP_TEMPLATES) it(`${template.id}: keeps the original narration and confines supplemental visuals to the matched window`, () => {
  const task = fixture(); task.options.broll!.pip!.template = template.id;
  const before = structuredClone(task);
  const result = pipRenderModel(task, task.options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(task).toEqual(before);
  expect(validateEditorDocumentV2(result.document)).toEqual([]);
  expect(result.composition.shots?.[0]).toMatchObject({ srcStart: 0, srcEnd: 10 });
  const media = result.visuals.find(clip => clip.source === 'blob:picture')!;
  expect(media).toMatchObject({ startSec: 2, endSec: 5, muted: true, fit: resolvePipGeometry(task.options.broll!.pip!, result.document.canvas, task.options.broll!.assets[0], task).mediaFit });
  expect(media.box).toEqual(resolvePipGeometry(task.options.broll!.pip!, result.document.canvas, task.options.broll!.assets[0], task).media);
  for (const visual of result.visuals) { expect(visual.startSec).toBe(2); expect(visual.endSec).toBe(5); expect(visual.muted).toBe(true); }
  if (template.id === 'smart' || template.id === 'split' || template.id === 'presenter' || template.id.startsWith('cutout')) {
    const presenter = result.visuals.find(clip => clip.source === 'blob:source');
    expect(presenter).toMatchObject({ sourceInSec: 2, sourceOutSec: 5, audioMuted: true });
    expect(presenter?.personMatte === true).toBe(template.id.startsWith('cutout'));
  }
});
it('rebuilds layout from the current clip edits, clearing obsolete backgrounds and presenter seats', () => {
  const task = fixture();
  task.document = pipRenderModel(task, task.options, 'blob:source', new Map([['picture', 'blob:picture']])).document;
  const options = structuredClone(task.options); options.broll!.edits = { clip: { start: 6, duration: 2, sourceIn: 0 } };
  const moved = pipRenderModel(task, options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(moved.visuals.every(clip => clip.startSec === 6 && clip.endSec === 8)).toBe(true);
  expect(moved.visuals.find(clip => clip.source === 'blob:source')).toMatchObject({ sourceInSec: 6, sourceOutSec: 8 });
  options.broll!.pip!.template = 'inset';
  const simple = pipRenderModel(task, options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(simple.visuals).toHaveLength(1); expect(simple.composition.blocks).toHaveLength(0);
  options.broll!.disabledPlacements = ['clip'];
  const removed = pipRenderModel(task, options, 'blob:source', new Map());
  expect(removed.visuals).toHaveLength(0); expect(removed.composition.blocks).toHaveLength(0);
});

it('renders the main-footage layout and current inset controls without mutating the input document', () => {
  const task = fixture(); const old = pipRenderModel(task, task.options, 'blob:source', new Map([['picture', 'blob:picture']]));
  task.document = old.document;
  const options = structuredClone(task.options);
  options.broll!.pip = { template: 'presenter', position: 'bottom-left', size: 'large', mediaFit: 'cover' };
  const next = pipRenderModel(task, options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(next.visuals.find(clip => clip.source === 'blob:picture')).toMatchObject({ fit: 'cover', box: { x: 0, y: 0, w: 1, h: 1 } });
  const expected = resolvePipGeometry(options.broll!.pip, next.document.canvas, options.broll!.assets[0], task);
  expect(next.visuals.find(clip => clip.source === 'blob:source')).toMatchObject({ box: expected.speaker, sourceInSec: 2, sourceOutSec: 5, audioMuted: true });
  expect(next.visuals.find(clip => clip.source === 'blob:source')!.box!.x).toBe(.04);
  const historical = pipRenderModel(task, task.options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(historical.visuals).toEqual(old.visuals);
  expect(task.document).toEqual(old.document);
});
it('exports split presenter source anchors and the complete footage instead of stretching or shrinking both into tiny cards', () => {
  const task = fixture(); task.options.broll!.pip = { template: 'split' };
  const result = pipRenderModel(task, task.options, 'blob:source', new Map([['picture', 'blob:picture']]));
  expect(result.visuals.find(clip => clip.source === 'blob:source')).toMatchObject({ fit: 'cover', anchorX: .5, anchorY: .4 });
  expect(result.visuals.find(clip => clip.source === 'blob:picture')).toMatchObject({ fit: 'contain', box: { x: 0, y: 0, w: 1 } });
});
it('rebuilds a remixable native draft without needing preview URLs', () => {
  const task = fixture(); task.options.broll!.pip = { template: 'presenter', position: 'top-left', size: 'small' };
  const result = pipRenderModel(task, task.options, '', new Map());
  expect(validateEditorDocumentV2(result.document)).toEqual([]);
  expect(Object.values(result.document.assets).map(asset => asset.locator.localSig)).toEqual(expect.arrayContaining(['source', 'picture']));
  const speaker = result.document.timeline.tracks.find(track => track.id === 'broll-pip-presenter')!.clips[0];
  expect(speaker).toMatchObject({ box: { x: .04, y: .06 }, video: { audioMuted: true } });
});
