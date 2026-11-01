import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyComposition } from '@pireel/studio-engine/composition';
import { compositionToEditorDocument } from '@pireel/studio-engine/project-document';
import { sourceAnchorAt, timelineSecForAnchor } from '@pireel/studio-ui/source-anchor';

const recording = () => compositionToEditorDocument({
  projectId: 'p',
  composition: { ...emptyComposition(), video: { url: 'blob:main', durationSec: 20 }, shots: [{ id: 'a', srcStart: 0, srcEnd: 20, treatment: 'full' }] },
}).document;

describe('source anchors', () => {
  it('follows the words when an earlier stretch is cut', () => {
    const document = recording();
    const anchor = sourceAnchorAt(document, 12)!;
    expect(anchor.sourceSec).toBeCloseTo(12);
    const track = document.semantics.primaryNarrativeTrackId;
    const fps = document.canvas.fps;
    const cut = applyEditorCommand(document, { type: 'range.remove', trackId: track, startFrame: 2 * fps, endFrame: 5 * fps, mode: 'ripple' });
    expect(cut.ok).toBe(true);
    expect(timelineSecForAnchor(cut.document, anchor)).toBeCloseTo(9);
  });

  it('reports a moment that was cut out, and an empty moment, as having no place', () => {
    const document = recording();
    const anchor = sourceAnchorAt(document, 3)!;
    const fps = document.canvas.fps;
    const cut = applyEditorCommand(document, { type: 'range.remove', trackId: document.semantics.primaryNarrativeTrackId, startFrame: 2 * fps, endFrame: 5 * fps, mode: 'ripple' });
    expect(timelineSecForAnchor(cut.document, anchor)).toBeNull();
    expect(sourceAnchorAt(document, 25)).toBeNull();
  });
});
