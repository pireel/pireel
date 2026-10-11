import type { UIMessage } from 'ai';
import type { FineCutItem, FineCutSkill, FirstPassReport } from './first-pass';
import type { WorkflowUsage } from '@pireel/studio-engine/workflow';

/** Saved with the initiating user message; retries retain the same identity and scope. */
export interface ChatTask {
  id: string;
  goal: string;
  outputId?: string;
  skills: string[];
  mode: 'one-click' | 'request';
  state: 'running' | 'paused' | 'partial' | 'done';
  fineCut?: { state: "running" | "done"; items: FineCutItem[] };
  fineCutBaseline?: Record<FineCutSkill, string[]>;
  roughCut?: { callId: string; report: FirstPassReport };
  lateUsage?: Record<string, number>;
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
  ].filter(Boolean).join('\n');
}
