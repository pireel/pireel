/** Server-backed Studio chat thread validation, restore sanitizing, and title derivation. */

import type { UIMessage } from 'ai';
import { t } from './i18n';
import type { AttachedFrame } from './studio-chat';
import { stripLeakedToolProtocolText } from '@pireel/studio-engine/tool-protocol-text';
import {
  isStudioScenarioSkillId,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';

export interface StoredThread {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
  /** Frame attached to the session (theme button highlight comes back when restoring the session). */
  frame?: AttachedFrame | null;
  /** Rich Markdown Studio Skill attached to this session; missing means no Skill. */
  skillId?: StudioScenarioSkillId;
}

export const MAX_VISUAL_REVIEWS_PER_USER_TURN = 2;

export function canRunVisualReview(completedReviews: number): boolean {
  return completedReviews < MAX_VISUAL_REVIEWS_PER_USER_TURN;
}

/** Remove non-display protocol parts while preserving every user-visible text fragment and tool
 * receipt. A text fragment may already be visible before a later tool call streams in; removing it
 * after that point makes completed prose disappear from the conversation. */
export function compactStudioChatMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const source = message.parts ?? [];
    const parts = source.flatMap((part) => {
      const candidate = part as { type?: string; text?: string };
      if (candidate.type === 'reasoning' || candidate.type === 'step-start') return [];
      if (candidate.type === 'text') {
        if (typeof candidate.text === 'string') {
          const text = stripLeakedToolProtocolText(candidate.text);
          return text.trim() ? [{ ...part, text } as typeof part] : [];
        }
      }
      return [part];
    });
    return { ...message, parts };
  });
}

export function normalizeStoredThreads(value: unknown, availableSkillIds: readonly string[] = []): StoredThread[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(availableSkillIds);
  return value
    .filter((thread): thread is StoredThread => !!thread
      && typeof thread === 'object'
      && typeof (thread as StoredThread).id === 'string'
      && Array.isArray((thread as StoredThread).messages))
    .map((thread) => ({
      ...thread,
      ...(isStudioScenarioSkillId(thread?.skillId)
        && (thread.skillId === 'auto' || available.has(thread.skillId))
        ? { skillId: thread.skillId }
        : { skillId: undefined }),
    }));
}

/** Sanitize a restored session: an interrupted tool can no longer continue, and provider-native tool
 *  protocol accidentally persisted as assistant text must never become visible history. */
export function sanitizeRestored(messages: UIMessage[]): UIMessage[] {
  return compactStudioChatMessages(messages.map((m) => {
    if (m.role !== 'assistant') return m;
    const parts = (m.parts ?? []).map((p) => {
      const tp = p as { type: string; state?: string; text?: string };
      if (tp.type === 'text' && typeof tp.text === 'string') {
        const text = stripLeakedToolProtocolText(tp.text);
        if (text !== tp.text) return { ...p, text } as typeof p;
      }
      if (tp.type.startsWith('tool-') && (tp.state === 'input-streaming' || tp.state === 'input-available')) {
        return { ...p, state: 'output-error', errorText: t('chatGen.generationInterrupted') } as typeof p;
      }
      return p;
    });
    return { ...m, parts };
  }));
}

/** The renderer intentionally hides reasoning and step markers. A completed assistant message
 * containing only those parts is therefore an empty response and must offer a visible retry. */
export function assistantMessageHasRenderableOutput(message: UIMessage): boolean {
  if (message.role !== 'assistant') return true;
  const compacted = compactStudioChatMessages([message])[0] ?? message;
  return (compacted.parts ?? []).some((part) => {
    const candidate = part as { type?: string; text?: string };
    if (candidate.type === 'text') return !!candidate.text?.trim();
    return candidate.type === 'dynamic-tool' || !!candidate.type?.startsWith('tool-');
  });
}

/** An interaction boundary cannot be resumed safely without the user. Automatic stream recovery
 * would just append another disabled copy of the same question/approval card. */
export function assistantHasOpenOrInterruptedInteraction(message: UIMessage | undefined): boolean {
  if (!message || message.role !== 'assistant') return false;
  return (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; toolName?: string; state?: string };
    const toolId = candidate.type === 'dynamic-tool'
      ? candidate.toolName
      : candidate.type?.startsWith('tool-')
        ? candidate.type.slice('tool-'.length)
        : '';
    return (toolId === 'ask_user' || toolId === 'request_approval')
      && candidate.state !== 'output-available';
  });
}

/** Only transport/stream failures are safe to continue from live project state automatically. */
export function isRecoverableStudioChatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();
  if (!normalized) return false;
  if (/(insufficient_tokens|not enough credits|unauthorized|forbidden|invalid_|request_too_large|messages_required|no_llm_configured|\b(?:400|401|403|413|422)\b)/i.test(normalized)) {
    return false;
  }
  return /(studio_stream_interrupted|failed to fetch|network(?:error| request failed)?|connection (?:closed|reset|interrupted)|stream (?:closed|interrupted|terminated)|load failed)/i.test(normalized);
}

export function firstUserText(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return '';
  return ((first.parts ?? []) as { type: string; text?: string }[])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('')
    .replace(/@[\w.-]+/g, '')
    .trim();
}
