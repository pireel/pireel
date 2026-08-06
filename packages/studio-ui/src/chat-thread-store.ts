/** localStorage persistence for studio chat threads: load/save, restore sanitizing, title derivation. */

import type { UIMessage } from 'ai';
import { t } from './i18n';
import type { AttachedFrame } from './studio-chat';
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
  /** Editorial scenario lens attached to this session; missing on legacy threads means automatic routing. */
  skillId?: StudioScenarioSkillId;
}

export function loadThreads(storageKey: string): StoredThread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const arr = JSON.parse(raw) as StoredThread[];
    if (!Array.isArray(arr)) return [];
    return arr.map((thread) => ({
      ...thread,
      ...(isStudioScenarioSkillId(thread?.skillId) ? { skillId: thread.skillId } : { skillId: undefined }),
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

/** Sanitize an interrupted session on restore: in a snapshot persisted mid-stream, a tool part may be stuck in "input arrived/still streaming"
 *  state — after restore there's no onToolCall to continue it, so without sanitizing the card spins forever. Mark it as an interrupted error;
 *  keep half-finished text parts as-is (whatever already streamed out is history). */
export function sanitizeRestored(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant') return m;
    const parts = (m.parts ?? []).map((p) => {
      const tp = p as { type: string; state?: string };
      if (tp.type.startsWith('tool-') && (tp.state === 'input-streaming' || tp.state === 'input-available')) {
        return { ...p, state: 'output-error', errorText: t('chatGen.generationInterrupted') } as typeof p;
      }
      return p;
    });
    return { ...m, parts };
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
