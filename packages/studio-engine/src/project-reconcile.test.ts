import { describe, expect, it } from 'vitest';
import { emptyProjectDocument } from './project-document';
import { createProjectOutputs } from './project-outputs';
import { reconcileProjectSave, reconcileValue } from './project-reconcile';
import type { StudioProjectDto } from './project-dto';
import { validateEditorDocumentV2 } from './editor-document';

function snapshot(): StudioProjectDto {
  return { id: 'p', title: 'Edit', document: emptyProjectDocument(), context: { schemaVersion: 3, outputs: createProjectOutputs(1) },
    videoSig: null, videoDurationSec: null, coverThumb: null, version: 1, updatedAt: 1 };
}

describe('project edit reconciliation', () => {
  it('merges independent entity edits despite array insertions changing all indices', () => {
    const base = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
    const local = [{ id: 'a', value: 10 }, { id: 'b', value: 2 }];
    const remote = [{ id: 'new', value: 0 }, { id: 'a', value: 1 }, { id: 'b', value: 20 }];
    expect(reconcileValue(base, local, remote)).toEqual({ collided: false, value: [
      { id: 'new', value: 0 }, { id: 'a', value: 10 }, { id: 'b', value: 20 },
    ] });
  });
  it('honours deletion, stable reordering, and distinguishes null from a removed field', () => {
    expect(reconcileValue({ a: 1, b: 2 }, { b: 2 }, { a: 1, b: 3 }).value).toEqual({ b: 3 });
    expect(reconcileValue({ a: null }, {}, { a: 'remote' }).collided).toBe(true);
    const base = [{ id: 'a' }, { id: 'b' }];
    expect(reconcileValue(base, [base[1], base[0]], [base[0], { id: 'new' }, base[1]]).value).toEqual([{ id: 'new' }, { id: 'b' }, { id: 'a' }]);
  });
  it('combines concurrent creation of the same graphics lane using the clips identities', () => {
    const local = [{ id: 'graphics', clips: [{ id: 'local-title', startFrame: 0 }] }];
    const remote = [{ id: 'graphics', clips: [{ id: 'remote-title', startFrame: 90 }] }];
    const merged = reconcileValue([], local, remote);
    expect(merged.collided).toBe(false);
    expect((merged.value as typeof local)[0]!.clips.map(c => c.id)).toEqual(['remote-title', 'local-title']);
  });
  it('merges independent document fields without a recovery output', () => {
    const base = snapshot(), local = structuredClone(base), remote = structuredClone(base);
    local.document.canvas.width = 800;
    remote.document.canvas.height = 900;
    remote.title = 'Renamed elsewhere';
    const next = reconcileProjectSave(base, local, remote);
    expect(next.document!.canvas).toMatchObject({ width: 800, height: 900 });
    expect(next.context!.outputs!.inactive).toHaveLength(0);
    expect(next.title).toBe('Renamed elsewhere');
  });
  it('keeps the current edit and an accessible recovery output for a real same-field collision', () => {
    const base = snapshot(), local = structuredClone(base), remote = structuredClone(base);
    local.document.canvas.width = 800;
    remote.document.canvas.width = 900;
    const next = reconcileProjectSave(base, local, remote);
    expect(next.document!.canvas.width).toBe(800);
    expect(next.context!.outputs!.inactive).toHaveLength(1);
    expect(next.context!.outputs!.inactive[0]!.document.canvas.width).toBe(900);
    const repeated = reconcileProjectSave(base, local, { ...remote, ...next } as StudioProjectDto);
    expect(repeated.context!.outputs!.inactive).toHaveLength(1);
  });
  it('does not merge the top-level documents of different active outputs', () => {
    const base = snapshot();
    base.context.outputs!.inactive.push({ id: 'second', title: 'Second', order: 1, createdAt: 1, updatedAt: 1,
      document: { ...emptyProjectDocument(), canvas: { ...base.document.canvas, width: 800 } }, videoSig: null, videoDurationSec: null, coverThumb: null });
    const local = structuredClone(base), remote = structuredClone(base);
    local.document.canvas.width = 700;
    const second = remote.context.outputs!.inactive[0]!;
    remote.context.outputs = { active: { id: second.id, title: second.title, order: 1, createdAt: 1, updatedAt: 1 },
      inactive: [{ ...base.context.outputs!.active, document: base.document, videoSig: null, videoDurationSec: null, coverThumb: null }] };
    remote.document = { ...second.document, canvas: { ...second.document.canvas, height: 1200 } };
    const next = reconcileProjectSave(base, local, remote);
    expect(next.context!.outputs!.active.id).toBe('output-main');
    expect(next.document!.canvas.width).toBe(700);
    expect(next.context!.outputs!.inactive.find(o => o.id === 'second')!.document.canvas).toMatchObject({ width: 800, height: 1200 });
  });
  it('keeps both valid trims when combining them would invalidate an inactive output', () => {
    const base = snapshot();
    const document = emptyProjectDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://example.test/video.mp4' }, metadata: { durationSec: 10 } };
    document.timeline.tracks.find(t => t.id === document.semantics.primaryNarrativeTrackId)!.clips.push({
      id: 'clip', kind: 'narrative', assetId: 'video', startFrame: 0, durationFrames: 300, enabled: true,
      sourceInSec: 0, sourceOutSec: 10, properties: { treatment: 'full' },
    });
    base.context.outputs!.inactive.push({ id: 'other', title: 'Other', order: 1, createdAt: 1, updatedAt: 1, document, videoSig: null, videoDurationSec: 10, coverThumb: null });
    const local = structuredClone(base), remote = structuredClone(base);
    const lc = local.context.outputs!.inactive[0]!.document.timeline.tracks.flatMap(t => t.clips)[0]!;
    const rc = remote.context.outputs!.inactive[0]!.document.timeline.tracks.flatMap(t => t.clips)[0]!;
    if (lc.kind !== 'narrative' || rc.kind !== 'narrative') throw new Error('fixture');
    lc.sourceInSec = 7; lc.durationFrames = 90;
    rc.sourceOutSec = 5; rc.durationFrames = 150;
    const next = reconcileProjectSave(base, local, remote);
    const saved = next.context!.outputs!.inactive;
    expect(saved).toHaveLength(2);
    for (const output of saved) expect(validateEditorDocumentV2(output.document).filter(i => i.severity === 'error')).toEqual([]);
    expect(saved.find(o => o.id === 'other')!.document.timeline.tracks.flatMap(t => t.clips)[0]).toMatchObject({ sourceInSec: 7, sourceOutSec: 10 });
    expect(saved.find(o => o.id.startsWith('recovery-'))!.document.timeline.tracks.flatMap(t => t.clips)[0]).toMatchObject({ sourceInSec: 0, sourceOutSec: 5 });
  });
});
