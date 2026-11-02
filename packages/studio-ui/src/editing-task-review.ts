import { coverSceneFromDocument, coverSceneInput } from '@pireel/studio-ui/cover-scene';
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
  cover?: { status: 'generated' | 'blocked' | 'skipped'; reason: string; jobId?: string };
  director?: { revision: number; summary: string; beats: DirectorBeatResult[] };
  items: { feature: EditReviewFeature; status: 'applied' | 'not_needed' | 'blocked'; reason: string; atFrame?: number; count: number }[];
}
export function requestedEditFeatures(task: ChatTask): EditReviewFeature[] {
  return EDIT_REVIEW_FEATURES.filter(id => id === 'transitions' ? false : id === 'zoom' ? task.config?.visual?.zoom : task.skills.includes(id) || id === 'graphics' && task.config?.visual?.headlines);
}
export function needsEditingReview(task: ChatTask): boolean {
  return (task.mode === 'one-click' || isWhiteboardDirectorTask(task)) && (!!task.directorPlanRequired || !!task.config?.brand || requestedEditFeatures(task).length > 0 || needsBrandCover(task));
}

export type EditingTaskReviewOutcome = { ok: true; review: EditingTaskReview } | { ok: false; error: string; problems: string[]; missing?: string[] };

/** A refusal listing every problem, so one more finish_edit can fix them all. */
function refused(problems: string[], missing: string[] = []): EditingTaskReviewOutcome {
  const error = problems.length === 1 ? problems[0]! : `Fix all of these, then call finish_edit once:\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join('\n')}`;
  return { ok: false, error, problems, ...(missing.length ? { missing } : {}) };
}

/** Validate completion against actual timeline evidence, not the model's claim that it added a feature.
 *  Every problem is reported at once: one at a time burns the retry budget on the next one. */
export function reviewEditingTask(task: ChatTask, input: Record<string, unknown>, evidence: EditingEvidence, document?: EditorDocumentV2): EditingTaskReviewOutcome {
  if (task.mode !== 'one-click' && !isWhiteboardDirectorTask(task)) return refused(['finish_edit is for a whole-video editing task.']);
  const problems: string[] = [];
  const missing: string[] = [];
  if (evidence.emptyMusicTracks?.length) problems.push(`Remove unused empty music tracks before finishing: ${evidence.emptyMusicTracks.join(', ')}. Create music lanes with actual placed audio, not pending suggestions.`);
  if (!isWhiteboardDirectorTask(task) && (!task.roughCut || task.roughCut.report.steps.some(step => ['pending', 'running', 'failed'].includes(step.status)))) problems.push('Complete the unfinished rough-cut steps first; preserve completed checkpoints.');
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
    if (!intact || Math.abs(sourceCursor-(sourceDuration ?? 0)) > 1/document.canvas.fps) problems.push('Preserve the complete original narration, order, speed and audible primary track for this whiteboard task.');
    else if (!whiteboardSceneReady(composition.blocks, document.canvas.width, document.canvas.height, frameCursor/document.canvas.fps)) problems.push('The whiteboard must cover the entire original narration at the selected aspect before finishing.');
  }
  const director = task.directorPlanRequired || task.directorPlan ? reviewDirectorPlan(task, input, document) : undefined;
  if (director && !director.ok) problems.push(...director.problems);
  const coverResult = reviewBrandCover(task, input.cover, document);
  if (!coverResult.ok) {
    problems.push(coverResult.error);
    if (coverResult.missing) missing.push(...coverResult.missing);
  }
  const wanted = requestedEditFeatures(task);
  const raw = Array.isArray(input.features) ? input.features as Record<string, unknown>[] : [];
  const unaccounted = wanted.filter(feature => !raw.some(item => item?.feature === feature));
  if (unaccounted.length) {
    problems.push(`Account for every enabled feature: ${unaccounted.join(', ')}.`);
    missing.push(...unaccounted);
  }
  const items: EditingTaskReview['items'] = [];
  const reviewed = (raw.some(item => item?.feature === 'transitions') ? [...wanted, 'transitions' as const] : wanted).filter(feature => !unaccounted.includes(feature));
  for (const feature of reviewed) {
    const row = raw.find(item => item?.feature === feature)!;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!['applied', 'not_needed', 'blocked'].includes(String(row.status)) || reason.length < 8) { problems.push(`Give a concrete content-based reason for ${feature}.`); continue; }
    const count = evidence[feature]?.length ?? 0;
    // A music bed is not a sound effect: without saying so, a model that laid music keeps re-adding it.
    if (row.status === 'applied' && !count) {
      problems.push(feature === 'sound'
        ? 'sound counts sound effects on an effects lane; a music bed on the music lane is not one. Add effects where points land, or report sound as not_needed or blocked with the content-based reason.'
        : `${feature} is absent from the current timeline. Apply it or report why it is blocked/not needed.`);
      continue;
    }
    if (row.status === 'not_needed' && feature === 'b-roll' && !brollContentReason(reason)) { problems.push('An empty library is a sourcing gap, not a content-based reason to skip B-roll. Search or generate when authorized, or report blocked.'); continue; }
    if (row.status !== 'blocked' && (typeof row.atFrame !== 'number' || !Number.isInteger(row.atFrame) || row.atFrame < 0)) { problems.push(`Name the timeline moment evaluated for ${feature} with atFrame.`); continue; }
    items.push({ feature, status: row.status as EditingTaskReview['items'][number]['status'], reason, count, ...(typeof row.atFrame === 'number' ? { atFrame: row.atFrame } : {}) });
  }
  const brandApplication = typeof input.brandApplication === 'string' ? input.brandApplication.trim() : '';
  if (task.config?.brand && brandApplication.length < 12) problems.push('Explain the concrete visual choices applied from the selected brand, not just its name.');
  if (problems.length || !coverResult.ok || (director && !director.ok)) return refused(problems, missing);
  return { ok: true, review: { completed: items.every(item => item.status !== 'blocked') && (director?.completed ?? true) && coverResult.cover?.status !== 'blocked', items, ...(coverResult.cover ? { cover: coverResult.cover } : {}), ...(director ? { director: { revision: task.directorPlan!.revision, summary: director.summary, beats: director.beats } } : {}), ...(brandApplication ? { brandApplication } : {}) } };
}

const SOURCING_GAP = /没有.{0,8}素材|无.{0,4}素材|no (?:available |supporting |usable )?(?:media|assets|footage)/i;

const CONSEQUENCE = /^\s*(?:所以|因此|因而|于是|故|so\b|therefore|hence|thus)/i;

/** A B-roll skip stands on content: an empty library alone is a sourcing gap, but saying so beside
 *  a content reason is honest context, so only the clauses about sourcing (and what follows from
 *  them) are set aside before looking for the reason. */
function brollContentReason(reason: string): boolean {
  const rest = reason.split(/[，。；;,.!?！？\n]+/).filter((clause) => !SOURCING_GAP.test(clause) && !CONSEQUENCE.test(clause)).join(' ').trim();
  return rest.length >= 8;
}

/** The harness runs the enabled cover itself when finish_edit arrives before any cover scene ran.
 *  An existing scene (running, ready, stale or failed) is left to the review: a stale or failed
 *  cover is a paid retry, which waits for the model's or the user's decision. */
export function coverStillToRun(task: ChatTask, document: EditorDocumentV2 | undefined, input: Record<string, unknown>): boolean {
  if (!needsBrandCover(task) || !document) return false;
  if (document.semantics.editingSkills && !document.semantics.editingSkills.includes('cover')) return false;
  const declared = (input.cover as { status?: unknown } | undefined)?.status;
  if (declared === 'skipped' || declared === 'blocked') return false;
  return !coverSceneFromDocument(document);
}

export function needsBrandCover(task: ChatTask): boolean {
  return task.mode === 'one-click' && !!(task.config?.skills.includes('cover') || task.skills.includes('cover'));
}

/** A separate delivery: the cover scene's outcome, or the reason it did not run. */
function reviewBrandCover(task: ChatTask, value: unknown, document: EditorDocumentV2 | undefined): { ok: true; cover?: EditingTaskReview['cover'] } | { ok: false; error: string; missing?: string[] } {
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
  // A generated cover only comes from the cover scene, which is read above.
  return { ok: false, error: 'Call generate_cover for the enabled cover before finishing; completion reads its scene. Report blocked only when it cannot run.', missing: ['cover'] };
}
