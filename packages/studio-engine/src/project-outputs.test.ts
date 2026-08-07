import { describe, expect, it } from 'vitest';
import { emptyProjectDocument } from './project-document';
import {
  createProjectOutputs,
  createBlankProjectOutput,
  deleteInactiveProjectOutput,
  duplicateActiveProjectOutput,
  listProjectOutputs,
  normalizeProjectOutputs,
  projectOutputPositionMap,
  renameProjectOutput,
  resolveProjectOutputId,
  switchProjectOutput,
  type ActiveProjectOutputState,
} from './project-outputs';

const state = (width = 1080): ActiveProjectOutputState => {
  const document = emptyProjectDocument();
  document.canvas.width = width;
  return {
    document,
    videoSig: 'main-sig',
    videoDurationSec: 12,
    coverThumb: 'data:image/jpeg;base64,x',
  };
};

describe('project outputs', () => {
  it('normalizes an old project into one active output', () => {
    expect(normalizeProjectOutputs(undefined, 10)).toEqual(createProjectOutputs(10));
  });

  it('creates an empty output and snapshots the previous active output', () => {
    const base = createProjectOutputs(10);
    const source = state();
    source.document.canvas.configured = true;
    const next = createBlankProjectOutput(base, source, '', 'pireel-long-to-shorts', 20);
    expect(next.outputs.active.title).toBe('');
    expect(next.outputs.active.skill).toBe('pireel-long-to-shorts');
    expect(next.outputs.inactive).toHaveLength(1);
    expect(next.outputs.inactive[0]!.id).toBe('output-main');
    expect(next.outputs.inactive[0]!.document.version).toBe(2);
    expect(next.outputs.inactive[0]).toMatchObject({ videoSig: 'main-sig', videoDurationSec: 12 });
    expect(next.target.document.version).toBe(2);
    expect(next.target.document.canvas).toMatchObject({ width: 1080, height: 1920, configured: true });
    expect(next.target.document.timeline.tracks.every((track) => track.clips.length === 0)).toBe(true);
    expect(next.target.document.assets).toEqual({});
    expect(next.target).toMatchObject({ videoSig: null, videoDurationSec: null, coverThumb: null });
  });

  it('switches atomically and preserves edits made to the previous active output', () => {
    const created = createBlankProjectOutput(createProjectOutputs(10), state(), 'Cut B', undefined, 20);
    const switched = switchProjectOutput(created.outputs, state(1920), 'output-main', 30)!;
    expect(switched.outputs.active.id).toBe('output-main');
    expect(switched.target.document.canvas.width).toBe(1080);
    expect(switched.outputs.inactive.find((item) => item.title === 'Cut B')!.document.canvas.width).toBe(1920);
    expect(listProjectOutputs(switched.outputs, state()).map((item) => item.order)).toEqual([0, 1]);
  });

  it('duplicates only through the explicit copy operation and assigns a stable new id', () => {
    const source = state();
    const copied = duplicateActiveProjectOutput(createProjectOutputs(10), source, 'Campaign cut', 20);
    expect(copied.target.id).not.toBe('output-main');
    expect(copied.target.title).toBe('Campaign cut');
    expect(copied.target.document).toEqual(source.document);
    expect(copied.target).toMatchObject({ videoSig: 'main-sig', videoDurationSec: 12 });
    expect(copied.outputs.inactive.map((output) => output.id)).toEqual(['output-main']);
  });

  it('renames and only deletes inactive outputs', () => {
    const created = createBlankProjectOutput(createProjectOutputs(10), state(), 'Cut B', undefined, 20);
    const renamed = renameProjectOutput(created.outputs, 'output-main', 'Original', 30);
    expect(renamed.inactive[0]!.title).toBe('Original');
    expect(deleteInactiveProjectOutput(renamed, renamed.active.id)).toBe(renamed);
    expect(deleteInactiveProjectOutput(renamed, 'output-main').inactive).toHaveLength(0);
    expect(deleteInactiveProjectOutput(renamed, 'output-main').active.id).toBe(renamed.active.id);
  });

  it('does not renumber or replace surviving ids after deletion', () => {
    const first = createBlankProjectOutput(createProjectOutputs(10), state(), 'First', undefined, 20);
    const second = createBlankProjectOutput(first.outputs, state(1920), 'Second', undefined, 30);
    const firstCopy = second.outputs.inactive.find((output) => output.id === first.target.id)!;
    const deleted = deleteInactiveProjectOutput(second.outputs, 'output-main');
    expect(deleted.active.id).toBe(second.target.id);
    expect(deleted.inactive).toHaveLength(1);
    expect(deleted.inactive[0]).toMatchObject({ id: firstCopy.id, order: firstCopy.order });
    expect([...projectOutputPositionMap(deleted).entries()]).toEqual([
      [1, firstCopy.id],
      [2, second.target.id],
    ]);
    expect(resolveProjectOutputId(deleted, { position: 1 })).toBe(firstCopy.id);
    expect(resolveProjectOutputId(deleted, {}, true)).toBe(second.target.id);
    expect(resolveProjectOutputId(deleted, { id: firstCopy.id, position: 2 })).toBeNull();
  });
});
