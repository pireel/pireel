import { buildCaptionTaskDocument, buildCaptionBaseDocument, captionTaskStyle, fitCaptionTaskDocumentLayout, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { composeBrollDocument } from '@pireel/studio-engine/broll-compose';
import { applyCaptionDocumentEdit, editorDocumentRenderPlan, projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { supplementalVisualMedia } from './visual-render-plan';
import { compositionRenderView } from './composition-render-view';
import type { CaptionTaskRecord } from './caption-task-store';

/** The same assembled document drives template changes, timeline edits and pure export. */
export function pipRenderModel(task: CaptionTaskRecord, options: CaptionTaskOptions, sourceUrl: string, urls: ReadonlyMap<string, string>) {
  const input = { projectId: task.id, sourceUrl, sourceName: task.name, sourceSig: task.sourceSig, width: task.width, height: task.height, durationSec: task.durationSec, options };
  let document = task.document ?? (options.broll?.captions && task.transcript?.length
    ? buildCaptionTaskDocument({ ...input, transcript: task.transcript })
    : buildCaptionBaseDocument({ ...input, transcript: [] }));
  const styled = applyCaptionDocumentEdit({ document, patch: { ...captionTaskStyle(options, document.canvas), on: !!options.broll?.captions }, mainTranscript: null, clipTranscripts: {} });
  if (!styled.ok) throw new Error(styled.error.message);
  document = composeBrollDocument(fitCaptionTaskDocumentLayout(styled.document, options), task.broll?.placements ?? [], task.broll?.candidates ?? [], options.broll!, task.durationSec);
  const resolveAssetUrl = (asset: { locator: { localSig?: string } }) => asset.locator.localSig === task.sourceSig ? sourceUrl : urls.get(asset.locator.localSig ?? '');
  const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
  return { document, composition: compositionRenderView(projectDocumentToComposition(document, { resolveAssetUrl }), plan), visuals: supplementalVisualMedia(plan) };
}
