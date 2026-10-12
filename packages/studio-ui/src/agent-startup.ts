import type { UIMessage } from 'ai';
import { latestTask, taskOf } from './chat-task';

/** A whiteboard keeps the recorded lesson intact; the ordinary home edit keeps its rough-cut flow. */
export function startWithRoughCut(skillId: string): boolean {
  return skillId !== 'whiteboard-explainer';
}
export function alreadyStarted(messages: readonly UIMessage[], prompt: string, roughCut: boolean): boolean {
  return messages.some(message => message.role === 'user' && (taskOf(message)?.goal === prompt || (roughCut && taskOf(message)?.mode === 'one-click')));
}
export type SceneAgentState = 'idle' | 'running' | 'attention' | 'done';
export function sceneAgentState(messages: readonly UIMessage[], busy: boolean, error: boolean): SceneAgentState {
  if (error) return 'attention';
  // A question is an actionable pause even while the transport waits for its answer.
  const last = messages.at(-1);
  if (last?.role === 'assistant' && last.parts.some(part => {
    const tool = part as { type?: string; toolName?: string; state?: string };
    return (tool.type === 'tool-ask_user' || tool.type === 'dynamic-tool' && tool.toolName === 'ask_user') && tool.state === 'input-available';
  })) return 'attention';
  if (busy) return 'running';
  const task = latestTask(messages);
  if (!task) return 'idle';
  return task.state === 'done' ? 'done' : task.state === 'running' ? 'running' : 'attention';
}
