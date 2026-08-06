import { describe, expect, it } from 'vitest';
import { emptyComposition, type Composition } from './composition';
import {
  createProjectOutputs,
  deleteInactiveProjectOutput,
  duplicateProjectOutput,
  listProjectOutputs,
  normalizeProjectOutputs,
  renameProjectOutput,
  switchProjectOutput,
  type ActiveProjectOutputState,
} from './project-outputs';

const state = (width = 1080): ActiveProjectOutputState => ({
  comp: { ...emptyComposition(), width, video: { url: 'blob:runtime-only', durationSec: 12 } } as Composition,
  videoSig: 'main-sig',
  videoDurationSec: 12,
  coverThumb: 'data:image/jpeg;base64,x',
});

describe('project outputs', () => {
  it('normalizes an old project into one active output', () => {
    expect(normalizeProjectOutputs(undefined, 10)).toEqual(createProjectOutputs(10));
  });

  it('duplicates the active output, strips runtime video and checks out the copy', () => {
    const base = createProjectOutputs(10);
    const next = duplicateProjectOutput(base, state(), 'Cut B', 'pireel-long-to-shorts', 20);
    expect(next.outputs.active.title).toBe('Cut B');
    expect(next.outputs.active.skill).toBe('pireel-long-to-shorts');
    expect(next.outputs.inactive).toHaveLength(1);
    expect(next.outputs.inactive[0]!.id).toBe('output-main');
    expect(next.outputs.inactive[0]!.comp.video).toBeNull();
    expect(next.target.comp.video).toBeNull();
  });

  it('switches atomically and preserves edits made to the previous active output', () => {
    const duplicated = duplicateProjectOutput(createProjectOutputs(10), state(), 'Cut B', undefined, 20);
    const switched = switchProjectOutput(duplicated.outputs, state(1920), 'output-main', 30)!;
    expect(switched.outputs.active.id).toBe('output-main');
    expect(switched.target.comp.width).toBe(1080);
    expect(switched.outputs.inactive.find((item) => item.title === 'Cut B')!.comp.width).toBe(1920);
    expect(listProjectOutputs(switched.outputs, state()).map((item) => item.order)).toEqual([0, 1]);
  });

  it('renames and only deletes inactive outputs', () => {
    const duplicated = duplicateProjectOutput(createProjectOutputs(10), state(), 'Cut B', undefined, 20);
    const renamed = renameProjectOutput(duplicated.outputs, 'output-main', 'Original', 30);
    expect(renamed.inactive[0]!.title).toBe('Original');
    expect(deleteInactiveProjectOutput(renamed, renamed.active.id)).toBe(renamed);
    expect(deleteInactiveProjectOutput(renamed, 'output-main').inactive).toHaveLength(0);
  });
});
