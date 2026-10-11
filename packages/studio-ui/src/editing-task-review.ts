import { reviewDirectorPlan, type DirectorBeatResult } from './editing-director-plan';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import type { ChatTask } from './chat-task';
import type { EditingEvidence } from './first-pass';

export const EDIT_REVIEW_FEATURES = ['graphics', 'b-roll', 'sound', 'zoom', 'transitions'] as const;
export type EditReviewFeature = typeof EDIT_REVIEW_FEATURES[number];
export interface EditingTaskReview {
  completed: boolean;
  brandApplication?: string;
  director?: { revision: number; summary: string; beats: DirectorBeatResult[] };
  items: { feature: EditReviewFeature; status: 'applied' | 'not_needed' | 'blocked'; reason: string; atFrame?: number; count: number }[];
}
export function requestedEditFeatures(task: ChatTask): EditReviewFeature[] {
  return EDIT_REVIEW_FEATURES.filter(id => id === 'zoom' || id === 'transitions' ? task.config?.visual?.[id] : task.skills.includes(id) || id === 'graphics' && task.config?.visual?.headlines);
}
export function needsEditingReview(task: ChatTask): boolean {
  return task.mode === 'one-click' && (!!task.directorPlanRequired || !!task.config?.brand || requestedEditFeatures(task).length > 0);
}

/** Validate completion against actual timeline evidence, not the model's claim that it added a feature. */
export function reviewEditingTask(task: ChatTask, input: Record<string, unknown>, evidence: EditingEvidence, document?: EditorDocumentV2): { ok: true; review: EditingTaskReview } | { ok: false; error: string; missing?: string[] } {
  if (task.mode !== 'one-click') return { ok: false, error: 'finish_edit is for a whole-video editing task.' };
  if (evidence.emptyMusicTracks?.length) return { ok: false, error: `Remove unused empty music tracks before finishing: ${evidence.emptyMusicTracks.join(', ')}. Create music lanes with actual placed audio, not pending suggestions.` };
  if (!task.roughCut || task.roughCut.report.steps.some(step => ['pending', 'running', 'failed'].includes(step.status))) return { ok: false, error: 'Complete the unfinished rough-cut steps first; preserve completed checkpoints.' };
  const director = task.directorPlanRequired || task.directorPlan ? reviewDirectorPlan(task, input, document) : undefined;
  if (director && !director.ok) return director;
  const wanted = requestedEditFeatures(task);
  const raw = Array.isArray(input.features) ? input.features as Record<string, unknown>[] : [];
  const missing = wanted.filter(feature => !raw.some(item => item?.feature === feature));
  if (missing.length) return { ok: false, error: 'Account for every enabled feature before finishing.', missing };
  const items: EditingTaskReview['items'] = [];
  for (const feature of wanted) {
    const row = raw.find(item => item?.feature === feature)!;
    const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
    if (!['applied', 'not_needed', 'blocked'].includes(String(row.status)) || reason.length < 8) return { ok: false, error: `Give a concrete content-based reason for ${feature}.` };
    const count = evidence[feature]?.length ?? 0;
    if (row.status === 'applied' && !count) return { ok: false, error: `${feature} is absent from the current timeline. Apply it or report why it is blocked/not needed.` };
    if (row.status === 'not_needed' && feature === 'b-roll' && /没有.{0,8}素材|无.{0,4}素材|no (?:available |supporting |usable )?(?:media|assets|footage)/i.test(reason)) return { ok: false, error: 'An empty library is a sourcing gap, not a content-based reason to skip B-roll. Search or generate when authorized, or report blocked.' };
    if (row.status !== 'blocked' && (typeof row.atFrame !== 'number' || !Number.isInteger(row.atFrame) || row.atFrame < 0)) return { ok: false, error: `Name the timeline moment evaluated for ${feature} with atFrame.` };
    items.push({ feature, status: row.status as EditingTaskReview['items'][number]['status'], reason, count, ...(typeof row.atFrame === 'number' ? { atFrame: row.atFrame } : {}) });
  }
  const brandApplication = typeof input.brandApplication === 'string' ? input.brandApplication.trim() : '';
  if (task.config?.brand && brandApplication.length < 12) return { ok: false, error: 'Explain the concrete visual choices applied from the selected brand, not just its name.' };
  return { ok: true, review: { completed: items.every(item => item.status !== 'blocked') && (director?.completed ?? true), items, ...(director ? { director: { revision: task.directorPlan!.revision, summary: director.summary, beats: director.beats } } : {}), ...(brandApplication ? { brandApplication } : {}) } };
}
