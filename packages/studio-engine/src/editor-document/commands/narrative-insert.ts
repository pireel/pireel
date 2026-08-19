import type { EditorDocumentV2, EditorMediaAsset, NarrativeTimelineClip } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { insertEditorClips } from './insert';
import { commandFailure, type EditorCommandResult } from './types';
import { directorPlanAfterRippleInsertion, withAdjustedDirectorPlan } from '../../director-plan-timing';
import { directorPlanFromDocument } from '../../director-plan-artifact';

function assetError(asset: EditorMediaAsset): string | null {
  if (!asset.id.trim()) return 'Narrative asset id is required.';
  if (asset.kind !== 'video') return 'Narrative clips require a video asset.';
  if (!asset.locator.localSig && !asset.locator.cloudKey && !asset.locator.remoteUrl) return 'Narrative asset needs at least one durable locator.';
  if (asset.metadata.durationSec != null && (!Number.isFinite(asset.metadata.durationSec) || asset.metadata.durationSec <= 0)) {
    return 'Narrative asset duration must be positive when supplied.';
  }
  return null;
}

/** Add durable media and ripple one equal-standing clip into the semantic narrative lane. */
export function insertNarrativeClip(
  document: EditorDocumentV2,
  atFrame: number,
  clip: Omit<NarrativeTimelineClip, 'startFrame'>,
  asset?: EditorMediaAsset,
  mode: 'ripple' | 'overwrite' = 'ripple',
  sceneId?: string,
): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  if (clip.kind !== 'narrative') return commandFailure(document, 'invalid-command', 'narrative.insert requires a narrative clip.', { path: 'clip.kind' });
  if (!Number.isInteger(atFrame) || atFrame < 0 || !Number.isInteger(clip.durationFrames) || clip.durationFrames <= 0) {
    return commandFailure(document, 'invalid-range', 'Narrative placement must use non-negative integral frames and a positive duration.', { path: 'clip' });
  }
  if (!Number.isFinite(clip.sourceInSec) || !Number.isFinite(clip.sourceOutSec) || clip.sourceInSec < 0 || clip.sourceOutSec <= clip.sourceInSec) {
    return commandFailure(document, 'invalid-range', 'Narrative source range must satisfy 0 <= in < out.', { path: 'clip' });
  }
  if (asset) {
    const invalidAsset = assetError(asset);
    if (invalidAsset) return commandFailure(document, 'invalid-command', invalidAsset, { path: 'asset' });
    if (asset.id !== clip.assetId) return commandFailure(document, 'invalid-command', 'Inserted asset id must match clip.assetId.', { path: 'clip.assetId' });
    if (document.assets[asset.id]) return commandFailure(document, 'invalid-command', `Asset already exists: ${asset.id}`, { path: 'asset.id' });
  } else {
    const existing = document.assets[clip.assetId];
    if (!existing) return commandFailure(document, 'invalid-command', `Narrative asset does not exist: ${clip.assetId}`, { path: 'clip.assetId' });
    if (existing.kind !== 'video') return commandFailure(document, 'invalid-command', `Asset is not video: ${clip.assetId}`, { path: 'clip.assetId' });
  }

  const withAsset = asset ? { ...document, assets: { ...document.assets, [asset.id]: asset } } : document;
  const inserted = insertEditorClips(withAsset, {
    trackId: document.semantics.primaryNarrativeTrackId,
    atFrame,
    clips: [{ ...clip, offsetFrames: 0 }],
    mode,
    includeLinked: true,
  });
  if (!inserted.ok) return { ...inserted, document };
  let semantics = {
    ...inserted.document.semantics,
    ...(inserted.document.semantics.primaryNarrativeAssetId ? {} : { primaryNarrativeAssetId: clip.assetId }),
  };
  const directorPlan = directorPlanFromDocument(document);
  if (mode === 'ripple' && directorPlan) {
    const adjusted = directorPlanAfterRippleInsertion(
      directorPlan,
      atFrame,
      clip.durationFrames,
      sceneId,
    );
    if (!adjusted.ok) return commandFailure(document, 'invalid-command', adjusted.error, { path: 'sceneId' });
    semantics = withAdjustedDirectorPlan(semantics, adjusted.plan);
    if (adjusted.sceneId) {
      semantics = {
        ...semantics,
        scenes: semantics.scenes.map((scene) => scene.id === adjusted.sceneId
          ? { ...scene, clipIds: [...scene.clipIds.filter((id) => id !== clip.id), clip.id] }
          : { ...scene, clipIds: scene.clipIds.filter((id) => id !== clip.id) }),
      };
    }
  }
  delete semantics.plan;
  return {
    ok: true,
    document: { ...inserted.document, semantics },
    receipt: { ...inserted.receipt, commandType: 'narrative.insert' },
  };
}
