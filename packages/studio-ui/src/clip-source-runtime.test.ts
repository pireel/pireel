import { describe, expect, it, vi } from 'vitest';
import { addNarrativeDocumentClip, compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { registerNarrativeSourceRuntime } from './clip-source-runtime';

function emptyDocument() {
  return compositionToEditorDocument({ projectId: 'clip-source-runtime', composition: emptyComposition() }).document;
}

const source = () => ({
  file: new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
  url: 'blob:clip',
  sig: 'clip.mp4:5:1',
  durationSec: 4,
});

describe('narrative source runtime registration', () => {
  it('registers the first empty-track source as the primary runtime source', () => {
    const clipFiles = new Map<string, File>();
    const onPrimarySource = vi.fn();
    const first = source();

    expect(registerNarrativeSourceRuntime({
      documentBeforeInsert: emptyDocument(),
      source: first,
      clipFiles,
      onPrimarySource,
    })).toBe('primary');
    expect(onPrimarySource).toHaveBeenCalledWith(first);
    expect(clipFiles).toEqual(new Map());
  });

  it('keeps later sources in the clip runtime map', () => {
    const first = addNarrativeDocumentClip({
      document: emptyDocument(),
      atSec: 0,
      shot: { id: 'first', src: 'blob:first', srcSig: 'first.mp4:5:1', srcStart: 0, srcEnd: 4, treatment: 'full' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const clipFiles = new Map<string, File>();
    const onPrimarySource = vi.fn();
    const next = source();

    expect(registerNarrativeSourceRuntime({
      documentBeforeInsert: first.document,
      source: next,
      clipFiles,
      onPrimarySource,
    })).toBe('clip');
    expect(onPrimarySource).not.toHaveBeenCalled();
    expect(clipFiles.get(next.url)).toBe(next.file);
  });
});
