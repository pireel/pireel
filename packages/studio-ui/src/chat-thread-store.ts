/** localStorage persistence for studio chat threads: load/save, restore sanitizing, title derivation. */

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

export function loadThreads(storageKey: string, availableSkillIds: readonly string[] = []): StoredThread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredThread[];
    if (!Array.isArray(arr)) return [];
    const available = new Set(availableSkillIds);
    return arr.map((thread) => ({
      ...thread,
      ...(isStudioScenarioSkillId(thread?.skillId)
        && (thread.skillId === 'auto' || available.has(thread.skillId))
        ? { skillId: thread.skillId }
        : { skillId: undefined }),
    }));
  } catch {
    return [];
  }
}
export function saveThreads(storageKey: string, threads: StoredThread[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(threads.slice(0, 30)));
  } catch {
    /* quota full / private mode — ignore */
  }
}

/** Sanitize a restored session: an interrupted tool can no longer continue, and provider-native tool
 *  protocol accidentally persisted as assistant text must never become visible history. */
export function sanitizeRestored(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
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
  });
}

/** The renderer intentionally hides reasoning and step markers. A completed assistant message
 * containing only those parts is therefore an empty response and must offer a visible retry. */
export function assistantMessageHasRenderableOutput(message: UIMessage): boolean {
  if (message.role !== 'assistant') return true;
  return (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; text?: string };
    if (candidate.type === 'text') return !!candidate.text?.trim();
    return candidate.type === 'dynamic-tool' || !!candidate.type?.startsWith('tool-');
  });
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
