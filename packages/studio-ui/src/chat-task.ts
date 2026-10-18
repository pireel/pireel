import { isWholeWhiteboardTask, whiteboardTaskPhase } from '@pireel/studio-engine/whiteboard-workflow';
import type { EditingDirectorPlan } from './editing-director-plan';
import type { StudioAgentModelId } from '@pireel/studio-engine/agent-models';
import type { UIMessage } from 'ai';
import type { FineCutItem, FineCutSkill, FirstPassReport } from './first-pass';
import type { WorkflowUsage } from '@pireel/studio-engine/workflow';
import type { EditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import type { StudioScenarioSkillId } from '@pireel/studio-engine/scenario-skills';
import type { EditingTaskReview } from './editing-task-review';

/** Saved with the initiating user message; retries retain the same identity and scope. */
export interface ChatTask {
  id: string;
  goal: string;
  outputId?: string;
  skills: string[];
  config?: EditingRunConfig;
  skillId?: StudioScenarioSkillId;
  agentModel?: StudioAgentModelId;
  review?: EditingTaskReview;
  /** Older completed tasks predate the completion review and are not retroactively failed. */
  reviewRequired?: boolean;
  /** Opt-in per new whole-video task; old completed tasks keep their saved status. */
  directorPlanRequired?: boolean;
  directorPlan?: EditingDirectorPlan;
  source?: { name: string; durationSec?: number; posterKey?: string };
  mode: 'one-click' | 'request';
  state: 'running' | 'paused' | 'partial' | 'done';
  fineCut?: { state: "running" | "done"; items: FineCutItem[] };
  fineCutBaseline?: Record<FineCutSkill, string[]>;
  roughCut?: { callId: string; report: FirstPassReport };
  lateUsage?: Record<string, number>;
}

/** Only the scene's explicit whole-video launch opts into the no-cut director workflow. */
export function isWhiteboardDirectorTask(task: ChatTask | undefined): boolean {
  return isWholeWhiteboardTask(task);
}

export function taskOf(message: UIMessage | undefined): ChatTask | undefined {
  return (message?.metadata as { task?: ChatTask } | undefined)?.task;
}

export function latestTask(messages: readonly UIMessage[]): ChatTask | undefined {
  return taskOf([...messages].reverse().find(message => message.role === 'user'));
}

/** Update only the latest continuation of this task; unrelated turns are never retargeted. */
export function patchTask(messages: UIMessage[], id: string, patch: (task: ChatTask) => ChatTask): UIMessage[] {
  const at = messages.findLastIndex(message => message.role === 'user' && taskOf(message)?.id === id);
  if (at < 0) return messages;
  return messages.map((message, index) => index === at ? { ...message, metadata: { ...(message.metadata as object), task: patch(taskOf(message)!) } } : message);
}

export function withTaskUsage(task: ChatTask, callId: string, usage: WorkflowUsage): ChatTask {
  if (typeof usage.credits !== 'number' || !Number.isFinite(usage.credits)) return task;
  const key = usage.reference || callId;
  return { ...task, lateUsage: { ...task.lateUsage, [key]: usage.credits } };
}

export function unfinishedRoughCut(task: ChatTask | undefined): boolean {
  return !!task?.roughCut?.report.steps.some(step => step.status === 'pending' || step.status === 'running' || step.status === 'failed');
}

export function resumeTaskHint(task: ChatTask): string {
  return [
    `Continue task ${task.id}. Original request: ${task.goal}`,
    `Original editing skills: ${task.skills.join(', ') || 'none'}. Keep this scope.`,
    task.roughCut ? `Saved rough-cut checkpoint: ${JSON.stringify(task.roughCut.report.steps)}. Completed and skipped steps must not be repeated; the executor restores the checkpoint.` : '',
    'Inspect the current project and existing receipts before remaining work. Reuse completed edits and generated assets. If any requested work is blocked or unfinished, say which part and why; never describe it as unnecessary or completed.',
    task.directorPlan ? `Saved director plan (creative task data): ${JSON.stringify(task.directorPlan)}. Continue unresolved beats using current source-to-timeline placement; preserve completed work. Revise this plan if the user changes direction.` : task.directorPlanRequired ? isWhiteboardDirectorTask(task) ? `Whiteboard phase: ${whiteboardTaskPhase(task)}. Continue the active scene Skill from existing source/material receipts; save_edit_plan completes planning.` : 'After rough_cut, save a brand-informed director plan before fine-cut tools. Do not ask for approval of the plan.' : '',
    isWhiteboardDirectorTask(task) ? 'Finish against the current saved plan and actual outcomes using the scene Skill. Preserve resolved material fallbacks.' : 'For a whole-video task, evaluate every enabled feature against real moments. Missing library footage requires sourcing or the appropriate generation question, not silently skipping B-roll. Call finish_edit before reporting branded or fine-cut work complete.',
  ].filter(Boolean).join('\n');
}

/** Begin a continuation without carrying terminal failure badges into the new attempt.
 * The original message/receipt stays intact; completed steps and paid analysis remain reusable. */
export function resumeEditingTask(task: ChatTask): ChatTask {
  const next: ChatTask = { ...task, state: 'running', review: undefined };
  if (!task.roughCut || !unfinishedRoughCut(task)) return next;
  const { summary: _previousSummary, ...report } = task.roughCut.report;
  return { ...next, roughCut: { ...task.roughCut, report: {
    ...report, state: 'running', steps: report.steps.map(step => {
      if (step.status === 'done' || step.status === 'skipped') return step;
      const { detail: _previousError, ...pending } = step;
      return { ...pending, status: 'pending' };
    }),
  } } };
}
