import type { UIMessage } from 'ai';
import { taskOf, unfinishedRoughCut, type ChatTask } from './chat-task';
import { v3ToolCanMutate } from '@pireel/studio-engine/agent-surface-v3/registry';
import type { FirstPassReport, FirstPassStepStatus, FineCutItem } from './first-pass';
import { needsEditingReview } from './editing-task-review';

export const toolIdOf = (part: { type: string; toolName?: unknown }) => part.type === 'dynamic-tool' ? String(part.toolName ?? '') : part.type.startsWith('tool-') ? part.type.slice(5) : '';
export function messagesForTask(messages: readonly UIMessage[], taskId: string): UIMessage[] {
  let current = '';
  return messages.filter(message => { if (message.role === 'user') current = taskOf(message)?.id ?? ''; return current === taskId; });
}
/** Keep actual decisions/results interactive, but never render an execution log as conversation. */
export function isInteractiveEditingTool(id: string, wholeVideo: boolean): boolean {
  return ['ask_user', 'request_approval', 'export', 'generate_image', 'generate_video', 'generate_audio', 'generate_speech', 'generate_foley', 'save_user_skill'].includes(id)
    || (!wholeVideo && ['search_assets', 'get_icons', 'manage_voices'].includes(id));
}
export function unresolvedTaskFailure(messages: readonly UIMessage[]): boolean {
  const latest = new Map<string, boolean>();
  for (const message of messages) if (message.role === 'assistant') for (const part of message.parts) {
    const id = toolIdOf(part);
    if (!id) continue;
    const value = part as { state?: string; output?: { ok?: boolean; error?: string; data?: { taskIncomplete?: boolean } } };
    if (id === 'read_brand' && value.output?.error === 'no_brand') continue;
    if (value.state === 'output-error' || value.state === 'output-available') latest.set(id, value.state === 'output-error' || value.output?.ok === false || value.output?.data?.taskIncomplete === true);
  }
  return [...latest.values()].some(Boolean);
}
/** A director's final review must look at the picture after the most recent successful edit. */
export function hasCurrentDirectorPreview(messages: readonly UIMessage[]): boolean {
  let checked = false;
  for (const message of messages) if (message.role === 'assistant') for (const part of message.parts) {
    const id = toolIdOf(part);
    const value = part as { state?: string; output?: { ok?: boolean } };
    if (value.state !== 'output-available' || value.output?.ok === false) continue;
    if (v3ToolCanMutate(id)) checked = false;
    else if (id === 'inspect_timeline') checked = true;
  }
  return checked;
}
/** Older snapshots sometimes marked a task complete when its stream ended despite a failed edit. */
export function displayEditingTask(task: ChatTask, messages: readonly UIMessage[]): ChatTask {
  return task.state === 'done' && (unfinishedRoughCut(task) || task.reviewRequired && needsEditingReview(task) && !task.review?.completed || unresolvedTaskFailure(messages)) ? { ...task, state: 'partial' } : task;
}

export interface EditingProgressRow { id: string; status: FirstPassStepStatus; detail?: string; reason?: string; count?: number }
const FINE_TOOLS: Record<string, string[]> = {
  graphics: ['set_look', 'compose_component', 'apply_component', 'place_graphics', 'set_texts'],
  'b-roll': ['search_media', 'generate_image', 'generate_video'],
  sound: ['generate_audio', 'generate_foley'],
};
export function editingTaskRows(task: ChatTask, report: FirstPassReport | undefined, messages: readonly UIMessage[], live: boolean, fine?: { items: FineCutItem[] }) {
  // SDK requests settle between tool batches; that is not the end of the editing task.
  const working = live || task.state === 'running';
  const steps = report?.steps ?? Object.entries(task.config?.steps ?? {}).map(([id, on]) => ({ id, status: on ? 'pending' : 'skipped' } as EditingProgressRow));
  const normalize = (status: FirstPassStepStatus): FirstPassStepStatus => status === 'running' && !live ? 'pending' : status;
  const rough: EditingProgressRow[] = [];
  const transcription = steps.find(step => step.id === 'transcribe');
  if (transcription && transcription.status !== 'skipped') rough.push({ id: 'transcribe', status: normalize(transcription.status) });
  const cleanup = steps.filter(step => ['cleanup', 'pauses'].includes(step.id) && step.status !== 'skipped');
  if (cleanup.length) rough.push({ id: 'cleanup', status: cleanup.some(step => step.status === 'failed') ? 'failed' : cleanup.some(step => step.status === 'running') ? normalize('running') : cleanup.every(step => step.status === 'done') ? 'done' : 'pending', detail: cleanup.find(step => step.status === 'running')?.id });
  const finishing: EditingProgressRow[] = steps.filter(step => ['captions', 'denoise', 'logo', 'loudness'].includes(step.id) && step.status !== 'skipped').map(step => ({ id: step.id, status: normalize(step.status) }));
  const tools = messages.flatMap(message => message.role === 'assistant' ? message.parts.filter(part => toolIdOf(part)) : []);
  const planning: EditingProgressRow | undefined = task.directorPlanRequired || task.directorPlan ? {
    id: 'planning', status: task.directorPlan ? 'done' : working && !!report && !report.steps.some(step => ['pending', 'running', 'failed'].includes(step.status)) ? 'running' : 'pending',
  } : undefined;
  for (const id of ['graphics', 'b-roll', 'sound']) {
    if (!task.skills.includes(id) && !(id === 'graphics' && task.config?.visual?.headlines)) continue;
    const savedItem = task.fineCut?.state === 'done' ? task.fineCut.items.find(item => item.id === id) : undefined;
    const item = fine?.items.find(item => item.id === id) ?? savedItem;
    const relevant = tools.filter(part => FINE_TOOLS[id].includes(toolIdOf(part)));
    const failed = unresolvedTaskFailure([{ id: 'phase', role: 'assistant', parts: relevant }]);
    const started = relevant.length > 0 || !!item?.count;
    finishing.push({ id, count: item?.count, status: working ? started ? 'running' : 'pending'
      : failed ? 'failed'
      // A task can stop with some phases complete. Restore those saved results independently
      // of the overall task state; live item counts alone still cannot complete a phase.
      : savedItem?.status === 'done' && savedItem.count > 0 ? 'done'
      : savedItem?.status === 'not-needed' ? 'skipped'
      : task.state === 'done' && !task.reviewRequired ? item?.count ? 'done' : 'skipped' : 'pending' });
  }
  for (const feature of ['zoom', 'transitions'] as const) if (task.config?.visual?.[feature]) {
    const camera = tools.filter(part => (feature === 'zoom' ? 'set_clip_framing' : 'add_transition') === toolIdOf(part));
    const last = camera.at(-1) as { state?: string; output?: { ok?: boolean } } | undefined;
    finishing.push({ id: feature, status: working ? last ? 'running' : 'pending' : last?.state === 'output-error' || last?.output?.ok === false ? 'failed' : last?.state === 'output-available' ? 'done' : 'pending' });
  }
  const lastMutation = tools.findLastIndex(part => v3ToolCanMutate(toolIdOf(part)) && (part as { state?: string; output?: { ok?: boolean } }).state === 'output-available' && (part as { output?: { ok?: boolean } }).output?.ok !== false);
  const inspectionStarted = tools.some(part => ['inspect_timeline', 'preview'].includes(toolIdOf(part)));
  const inspections = tools.filter((part, index) => index > lastMutation && ['inspect_timeline', 'preview'].includes(toolIdOf(part)));
  if (inspectionStarted) {
    const last = inspections.at(-1) as { state?: string; output?: { ok?: boolean } };
    finishing.push({ id: 'review', status: working ? 'running' : last?.state === 'output-error' || last?.output?.ok === false ? 'failed' : last?.state === 'output-available' ? 'done' : 'pending' });
  }
  return { rough, planning, finishing: finishing.map(row => {
    const reviewed = task.review?.items.find(item => item.feature === row.id);
    if (working) return row;
    return reviewed ? { ...row, status: reviewed.status === 'applied' ? 'done' as const : reviewed.status === 'blocked' ? 'failed' as const : 'skipped' as const, reason: reviewed.reason, count: reviewed.count } : row;
  }) };
}
