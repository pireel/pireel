import type { UIMessage } from 'ai';
import { latestTask, taskOf } from '@pireel/studio-ui/chat-task';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';
import { documentIsEdited } from '@pireel/studio-ui/first-pass';
import type { StudioChatDraftPart } from '@pireel/studio-ui/studio-chat';
import { t } from '@pireel/studio-ui/i18n';

/** A whiteboard keeps the recorded lesson intact; the ordinary home edit keeps its rough-cut flow. */
export function startWithRoughCut(skillId: string): boolean {
  return skillId !== 'whiteboard-explainer';
}
/** A thread's first message on imported footage nobody has edited yet, with editing skills on, is the
 *  one-click edit of that footage. */
export function firstMessageEditsFootage(document: EditorDocumentV2 | undefined, messages: readonly UIMessage[], skillId: string, skills: readonly string[]): boolean {
  return !messages.length && !!skills.length && startWithRoughCut(skillId) && footageToEdit(document);
}
/** Imported footage on the story track that nobody has edited yet. */
export function footageToEdit(document: EditorDocumentV2 | undefined): boolean {
  if (!document || documentIsEdited(document)) return false;
  const primary = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId);
  return !!primary?.clips.some(clip => clip.kind === 'narrative' && clip.enabled);
}
/** That first message as the Studio home words it: the edit, then whatever the creator asked for. */
export function firstEditMessage(parts: readonly StudioChatDraftPart[]): StudioChatDraftPart[] {
  const asked = parts.filter(part => part.type !== 'text' || part.text.trim());
  return [{ type: 'text', text: t('chatGen.editWithSwitches') + (asked.length ? `\n${t('chatGen.requestedChanges')} ` : '') }, ...asked];
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
