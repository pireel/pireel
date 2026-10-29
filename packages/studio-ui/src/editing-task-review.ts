import { coverSceneFromDocument, coverSceneInput } from '@pireel/studio-ui/cover-scene';
import type { UIMessage } from 'ai';
import { reviewDirectorPlan, type DirectorBeatResult } from '@pireel/studio-ui/editing-director-plan';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { isWhiteboardDirectorTask, type ChatTask } from '@pireel/studio-ui/chat-task';
import { projectDocumentToComposition } from '@pireel/studio-engine/project-document';
import { whiteboardSceneReady } from '@pireel/studio-ui/whiteboard-scene-result';
import type { EditingEvidence } from '@pireel/studio-ui/first-pass';
import { t } from './i18n';

export const EDIT_REVIEW_FEATURES = ['graphics', 'b-roll', 'sound', 'zoom', 'transitions'] as const;
export type EditReviewFeature = typeof EDIT_REVIEW_FEATURES[number];
export interface EditingTaskReview {
  completed: boolean;
  brandApplication?: string;
  cover?: { status: 'generated' | 'blocked' | 'skipped'; reason: string; jobId?: string; assetId?: string; url?: string };
  director?: { revision: number; summary: string; beats: DirectorBeatResult[] };
  items: { feature: EditReviewFeature; status: 'applied' | 'not_needed' | 'blocked'; reason: string; atFrame?: number; count: number }[];
}
export function requestedEditFeatures(task: ChatTask): EditReviewFeature[] {
  return EDIT_REVIEW_FEATURES.filter(id => id === 'transitions' ? false : id === 'zoom' ? task.config?.visual?.zoom : task.skills.includes(id) || id === 'graphics' && task.config?.visual?.headlines);
}
export function needsEditingReview(task: ChatTask): boolean {
  return (task.mode === 'one-click' || isWhiteboardDirectorTask(task)) && (!!task.directorPlanRequired || !!task.config?.brand || requestedEditFeatures(task).length > 0 || needsBrandCover(task));
}

/** Validate completion against actual timeline evidence, not the model's claim that it added a feature. */
export function reviewEditingTask(task: ChatTask, input: Record<string, unknown>, evidence: EditingEvidence, document?: EditorDocumentV2, messages: readonly UIMessage[] = []): { ok: true; review: EditingTaskReview } | { ok: false; error: string; missing?: string[] } {
  if (task.mode !== 'one-click' && !isWhiteboardDirectorTask(task)) return { ok: false, error: 'finish_edit is for a whole-video editing task.' };
  if (evidence.emptyMusicTracks?.length) return { ok: false, error: `Remove unused empty music tracks before finishing: ${evidence.emptyMusicTracks.join(', ')}. Create music lanes with actual placed audio, not pending suggestions.` };
  if (!isWhiteboardDirectorTask(task) && (!task.roughCut || task.roughCut.report.steps.some(step => ['pending', 'running', 'failed'].includes(step.status)))) return { ok: false, error: 'Complete the unfinished rough-cut steps first; preserve completed checkpoints.' };
  if (isWhiteboardDirectorTask(task) && document) {
    const composition = projectDocumentToComposition(document);
    const primary = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId);
    const voice = (primary?.clips.filter(c => c.enabled) ?? []).sort((a,b) => a.startFrame-b.startFrame);
    const first = voice[0];
    const assetId = first && 'assetId' in first ? first.assetId : undefined;
    const sourceDuration = task.source?.durationSec ?? (assetId ? document.assets[assetId]?.metadata.durationSec : undefined);
    let sourceCursor = 0, frameCursor = 0;
    let intact = !!voice.length && !primary?.muted && typeof sourceDuration === 'number';
    for (const clip of voice) {
      if (!('assetId' in clip) || !('sourceInSec' in clip) || !('sourceOutSec' in clip) || typeof clip.sourceInSec !== 'number' || typeof clip.sourceOutSec !== 'number' || clip.assetId !== assetId
        || Math.abs(clip.sourceInSec-sourceCursor) > 1/document.canvas.fps || clip.startFrame !== frameCursor
        || Math.abs((clip.sourceOutSec-clip.sourceInSec)*document.canvas.fps-clip.durationFrames) > 1) { intact=false; break; }
      if (clip.kind === 'narrative' && clip.properties?.audioMuted || clip.kind === 'media' && clip.video?.audioMuted) intact=false;
      sourceCursor=clip.sourceOutSec;frameCursor=clip.startFrame+clip.durationFrames;
    }
    if (!intact || Math.abs(sourceCursor-(sourceDuration ?? 0)) > 1/document.canvas.fps) return { ok:false,error:'Preserve the complete original narration, order, speed and audible primary track for this whiteboard task.' };
    const end = frameCursor/document.canvas.fps;
    if (!whiteboardSceneReady(composition.blocks, document.canvas.width, document.canvas.height, end)) return { ok: false, error: 'The whiteboard must cover the entire original narration at the selected aspect before finishing.' };
  }
  const director = task.directorPlanRequired || task.directorPlan ? reviewDirectorPlan(task, input, document) : undefined;
  if (director && !director.ok) return director;
  const coverResult = reviewBrandCover(task, input.cover, document, messages);
  if (!coverResult.ok) return coverResult;
  const wanted = requestedEditFeatures(task);
  const raw = Array.isArray(input.features) ? input.features as Record<string, unknown>[] : [];
  const missing = wanted.filter(feature => !raw.some(item => item?.feature === feature));
  if (missing.length) return { ok: false, error: 'Account for every enabled feature before finishing.', missing };
  const items: EditingTaskReview['items'] = [];
  const reviewed = raw.some(item => item?.feature === 'transitions') ? [...wanted, 'transitions' as const] : wanted;
  for (const feature of reviewed) {
    const row = raw.find(item => item?.feature === feature)!;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!['applied', 'not_needed', 'blocked'].includes(String(row.status)) || reason.length < 8) return { ok: false, error: `Give a concrete content-based reason for ${feature}.` };
    const count = evidence[feature]?.length ?? 0;
    // A music bed is not a sound effect: without saying so, a model that laid music keeps re-adding it.
    if (row.status === 'applied' && !count) return { ok: false, error: feature === 'sound'
      ? 'sound counts sound effects on an effects lane; a music bed on the music lane is not one. Add effects where points land, or report sound as not_needed or blocked with the content-based reason.'
      : `${feature} is absent from the current timeline. Apply it or report why it is blocked/not needed.` };
    if (row.status === 'not_needed' && feature === 'b-roll' && /没有.{0,8}素材|无.{0,4}素材|no (?:available |supporting |usable )?(?:media|assets|footage)/i.test(reason)) return { ok: false, error: 'An empty library is a sourcing gap, not a content-based reason to skip B-roll. Search or generate when authorized, or report blocked.' };
    if (row.status !== 'blocked' && (typeof row.atFrame !== 'number' || !Number.isInteger(row.atFrame) || row.atFrame < 0)) return { ok: false, error: `Name the timeline moment evaluated for ${feature} with atFrame.` };
    items.push({ feature, status: row.status as EditingTaskReview['items'][number]['status'], reason, count, ...(typeof row.atFrame === 'number' ? { atFrame: row.atFrame } : {}) });
  }
  const brandApplication = typeof input.brandApplication === 'string' ? input.brandApplication.trim() : '';
  if (task.config?.brand && brandApplication.length < 12) return { ok: false, error: 'Explain the concrete visual choices applied from the selected brand, not just its name.' };
  return { ok: true, review: { completed: items.every(item => item.status !== 'blocked') && (director?.completed ?? true) && coverResult.cover?.status !== 'blocked', items, ...(coverResult.cover ? { cover: coverResult.cover } : {}), ...(director ? { director: { revision: task.directorPlan!.revision, summary: director.summary, beats: director.beats } } : {}), ...(brandApplication ? { brandApplication } : {}) } };
}


export function needsBrandCover(task: ChatTask): boolean {
  return task.mode === 'one-click' && !!(task.config?.skills.includes('cover') || task.skills.includes('cover'));
}

/** A separate delivery: match a cover job from this task to its settled, registered image. */
function reviewBrandCover(task: ChatTask, value: unknown, document: EditorDocumentV2 | undefined, messages: readonly UIMessage[]): { ok: true; cover?: EditingTaskReview['cover'] } | { ok: false; error: string; missing?: string[] } {
  if (!needsBrandCover(task)) return { ok: true };
  if (document?.semantics.editingSkills && !document.semantics.editingSkills.includes('cover')) return { ok: true, cover: { status: 'skipped', reason: t('ui.editingReview.coverOff') } };
  const scene = document ? coverSceneFromDocument(document) : null;
  if (scene) {
    if (scene.phase === 'ready' && scene.images.length && scene.inputFingerprint === coverSceneInput(document!).fingerprint) return { ok: true, cover: { status: 'generated', reason: t('ui.editingReview.coverDone'), jobId: scene.jobId } };
    return { ok: true, cover: { status: 'blocked', reason: scene.phase === 'failed' ? t('ui.editingReview.coverIncomplete') : scene.phase === 'ready' ? t('ui.editingReview.coverStale') : t('ui.editingReview.coverRunning') } };
  }
  if (!value || typeof value !== 'object') return { ok: false, error: 'Call generate_cover for the enabled cover before finishing; no confirmation is needed.', missing: ['cover'] };
  const row = value as Record<string, unknown>;
  const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
  if (reason.length < 8) return { ok: false, error: 'Explain the actual cover outcome.' };
  if (row.status === 'blocked') return { ok: true, cover: { status: 'blocked', reason } };
  if (row.status === 'skipped') {
    // Only an explicit scope change can cancel delivery; stylistic preference is not an opt-out.
    if (!/(?:不要|无需|不需要|不用|别)(?:.{0,8})(?:封面|缩略图)|(?:no|without|skip|omit|do not|don’t|don't)(?:.{0,24})(?:cover|thumbnail)/i.test(task.goal)) return { ok: false, error: 'The selected brand includes a cover. Generate it or report blocked; do not silently skip it.' };
    return { ok: true, cover: { status: 'skipped', reason } };
  }
  if (row.status !== 'generated' || typeof row.jobId !== 'string' || typeof row.assetId !== 'string') return { ok: false, error: 'A generated cover needs its actual jobId and registered image assetId.' };
  const parts = messages.flatMap(message => message.role === 'assistant' ? message.parts : []).map(part => part as { type: string; toolName?: string; state?: string; input?: Record<string, unknown>; output?: { ok?: boolean; data?: { ids?: string[]; jobs?: { id: string; status: string; assets?: { key?: string; url?: string; mime?: string }[] }[]; images?: { ref: string }[] } } });
  const succeeded = parts.filter(part => part.state === 'output-available' && part.output?.ok !== false);
  const named = (part: typeof parts[number], name: string) => part.type === `tool-${name}` || part.type === 'dynamic-tool' && part.toolName === name;
  const started = succeeded.some(part => named(part, 'generate_image') && part.input?.purpose === 'cover' && part.output?.data?.ids?.includes(row.jobId as string));
  const settledAt = succeeded.findLastIndex(part => named(part, 'inspect_media') && part.input?.mode === 'generation' && part.output?.data?.jobs?.some(job => job.id === row.jobId));
  const job = succeeded[settledAt]?.output?.data?.jobs?.find(job => job.id === row.jobId);
  const asset = document?.assets[row.assetId];
  const output = job?.status === 'succeeded' && asset?.kind === 'image' ? job.assets?.find(output => (!output.mime || output.mime.startsWith('image/')) && (output.key && asset.locator.cloudKey === output.key || output.url && asset.locator.remoteUrl === output.url)) : undefined;
  if (!started || !output?.url || !/^https?:\/\//i.test(output.url)) return { ok: false, error: 'The cover is not a succeeded image generation from this task registered in this output. Check generation status, register its image, or report blocked.' };
  const inspected = succeeded.some((part, index) => index > settledAt && named(part, 'inspect_media') && part.input?.mode === 'frames' && part.output?.data?.images?.some(image => image.ref === row.assetId));
  if (!inspected) return { ok: false, error: 'Inspect the actual cover image for headline, subject identity and brand style before finishing.' };
  return { ok: true, cover: { status: 'generated', reason, jobId: row.jobId, assetId: row.assetId, url: output.url } };
}
