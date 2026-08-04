import { describe, expect, it } from 'vitest';
import { editorDocumentRenderPlan, emptyEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { primaryNarrativeRenderPlan } from './primary-render-plan';

describe('primary narrative render plan', () => {
  it('keeps disabled clip geometry while excluding it from media decode', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main' }, metadata: { durationSec: 3 } };
    const track = document.timeline.tracks[0]!;
    track.hidden = true;
    track.muted = true;
    track.clips = [
      {
        id: 'disabled', kind: 'narrative', assetId: 'main', startFrame: 30, durationFrames: 60,
        sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' }, enabled: false,
      },
      {
        id: 'active', kind: 'narrative', assetId: 'main', startFrame: 120, durationFrames: 30,
        sourceInSec: 2, sourceOutSec: 3, properties: { treatment: 'full' }, enabled: true,
      },
    ];

    const renderPlan = editorDocumentRenderPlan(document);
    const primary = primaryNarrativeRenderPlan(renderPlan);
    expect(renderPlan.durationSec).toBe(5);
    expect(primary).toMatchObject({ trackId: track.id, hidden: true, muted: true });
    expect(primary.placements).toEqual([
      { shotId: 'disabled', startSec: 1, endSec: 3, enabled: false },
      { shotId: 'active', startSec: 4, endSec: 5, enabled: true },
    ]);
    expect(primary.activePlacements).toEqual([{ shotId: 'active', startSec: 4, endSec: 5 }]);
    expect(primary.activeEntries.map((entry) => entry.clipId)).toEqual(['active']);
  });
});
