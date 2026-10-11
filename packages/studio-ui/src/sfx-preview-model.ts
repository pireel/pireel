import { buildCaptionBaseDocument } from '@pireel/studio-engine/caption-task';
import { editorDocumentRenderPlan, projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { compositionRenderView } from './composition-render-view';
import { supplementalVisualMedia } from './visual-render-plan';
import type { CaptionTaskRecord } from './caption-task-store';
export function sfxPreviewModel(task: CaptionTaskRecord, sourceUrl: string, urls: ReadonlyMap<string, string>) {
  const document = task.document ?? buildCaptionBaseDocument({ projectId: task.id, sourceName: task.name, sourceUrl, sourceSig: task.sourceSig, width: task.width, height: task.height, durationSec: task.durationSec, transcript: [], options: task.options });
  const resolveAssetUrl = (asset: { locator: { localSig?: string; remoteUrl?: string } }) => asset.locator.localSig === task.sourceSig ? sourceUrl : urls.get(asset.locator.localSig ?? '') ?? asset.locator.remoteUrl;
  const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
  return { document, composition: compositionRenderView(projectDocumentToComposition(document, { resolveAssetUrl }), plan), visuals: supplementalVisualMedia(plan) };
}
