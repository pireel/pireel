import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { directorPlanFromSeconds } from '@pireel/studio-engine/director-plan';
import { directorSceneGeometry, timelineDirectorScenesFromDocument } from './director-scene-strip';

describe('Director Scene strip geometry', () => {
  it('maps plan seconds onto timeline pixels and keeps narrow scenes clickable', () => {
    const geometry = directorSceneGeometry([
      { id: 'hook', label: 'Hook', startSec: 0, endSec: 4, purpose: 'Orient.', clipCount: 1 },
      { id: 'proof', label: 'Proof', startSec: 4, endSec: 4.05, purpose: 'Prove.', clipCount: 2 },
    ], 50);
    expect(geometry.map(({ id, left, width }) => ({ id, left, width }))).toEqual([
      { id: 'hook', left: 0, width: 198 },
      { id: 'proof', left: 200, width: 10 },
    ]);
  });

  it('drops invalid or empty intervals instead of rendering broken buttons', () => {
    expect(directorSceneGeometry([
      { id: 'empty', label: 'Empty', startSec: 3, endSec: 3, purpose: 'None.', clipCount: 0 },
      { id: 'invalid', label: 'Invalid', startSec: 4, endSec: Number.NaN, purpose: 'None.', clipCount: 0 },
    ], 50)).toEqual([]);
  });

  it('projects persisted plan metadata and live SemanticScene clip counts', () => {
    const document = emptyEditorDocumentV2({ fps: 25 });
    document.semantics.directorPlan = directorPlanFromSeconds({
      goal: 'Explain.', creativeThesis: 'One clear proof.',
      scenes: [{
        id: 'proof', label: 'Visible proof', startSec: 2, durationSec: 3,
        viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show evidence.',
        visualTreatment: 'Let the evidence lead.', assetStrategy: 'Use project footage.',
      }],
    }, 25).plan!;
    document.semantics.scenes = [{ id: 'proof', clipIds: ['video', 'graphic'] }];
    expect(timelineDirectorScenesFromDocument(document)).toEqual([{
      id: 'proof', label: 'Visible proof', startSec: 2, endSec: 5, purpose: 'Show evidence.',
      visualTreatment: 'Let the evidence lead.', assetStrategy: 'Use project footage.', clipCount: 2,
    }]);
  });
});
