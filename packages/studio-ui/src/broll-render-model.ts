import { buildCaptionTaskDocument, captionTaskStyle, fitCaptionTaskDocumentLayout, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { applyCaptionDocumentEdit, emptyComposition, projectDocumentToComposition } from '@pireel/studio-engine/composition';
import type { CaptionTaskRecord } from './caption-task-store';

/** Local edit rendering: identical subtitle/source geometry for the canvas and MP4 export. */
export function brollRenderComposition(task: CaptionTaskRecord, options: CaptionTaskOptions, sourceUrl: string) {
  if (task.workflow?.definition.version === 2 && task.document) {
    const styled = applyCaptionDocumentEdit({ document: task.document, patch: { ...captionTaskStyle(options, task.document.canvas), on: !!options.broll?.captions }, mainTranscript: null, clipTranscripts: {} });
    if (!styled.ok) throw new Error(styled.error.message);
    return projectDocumentToComposition(fitCaptionTaskDocumentLayout(styled.document, options), { resolveAssetUrl: asset => asset.locator.localSig === task.sourceSig ? sourceUrl : undefined });
  }
  if (options.broll?.captions && task.transcript?.length) {
    return projectDocumentToComposition(buildCaptionTaskDocument({ projectId: task.id, sourceUrl,
      sourceName: task.name, sourceSig: task.sourceSig, width: task.width, height: task.height,
      durationSec: task.durationSec, transcript: task.transcript, options }));
  }
  return { ...emptyComposition(), width: task.width, height: task.height,
    video: { url: sourceUrl, durationSec: task.durationSec },
    shots: [{ id: 'scene-source', src: sourceUrl, srcStart: 0, srcEnd: task.durationSec, treatment: 'full' as const }] };
}
