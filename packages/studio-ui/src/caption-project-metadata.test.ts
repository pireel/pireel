import { describe, expect, it } from 'vitest';
import { mergeCaptionProjectMetadata, type CaptionTaskRecord } from './caption-task-store';
const task: CaptionTaskRecord = { id: 'caption', scope: 'owner', name: 'old name', updatedAt: 10, durationSec: 5, width: 1080, height: 1920, sourceSig: 'sig', options: { presetId: 'clean', aspect: 'original', shortenPauses: false }, stage: 'rendering' };
describe('caption metadata ownership', () => {
  it('preserves a newer rename and archive when an older runner checkpoints', () => {
    const stored = { ...task, name: 'new name', archivedAt: 20, metadataUpdatedAt: 20, updatedAt: 20 };
    const merged = mergeCaptionProjectMetadata({ ...task, stage: 'completed', updatedAt: 30 }, stored);
    expect(merged).toMatchObject({ name: 'new name', archivedAt: 20, stage: 'completed', updatedAt: 30 });
  });
  it('does not borrow metadata from another account or project', () => {
    expect(mergeCaptionProjectMetadata(task, { ...task, scope: 'another', name: 'secret', metadataUpdatedAt: 100 })).toBe(task);
    expect(mergeCaptionProjectMetadata(task, { ...task, id: 'another', name: 'other', metadataUpdatedAt: 100 })).toBe(task);
  });
});
