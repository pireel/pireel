/**
 * Agent surface v3 — persisted chat history hygiene.
 *
 * Threads saved under an earlier tool surface carry tool parts named after tools that no longer
 * exist. Fed back to the model unchanged they teach it names it cannot call, so before the model
 * sees history those parts are dropped; parts naming a current tool travel unchanged. The stored
 * thread is never rewritten.
 */

import { V3_TOOL_IDS } from './registry';

interface PartLike {
  type: string;
  toolName?: string;
  [key: string]: unknown;
}

interface MessageLike {
  role: string;
  parts: PartLike[];
  [key: string]: unknown;
}

function toolIdOf(part: PartLike): string | null {
  if (part.type === 'dynamic-tool' && typeof part.toolName === 'string') return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice('tool-'.length);
  return null;
}

/** Drop assistant tool parts that name a tool outside the current surface. Returns the same array when nothing changed. */
export function pruneUnknownToolParts<M extends MessageLike>(messages: readonly M[]): M[] {
  let changed = false;
  const out = messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const parts = message.parts.filter((part) => {
      const id = toolIdOf(part);
      return !id || V3_TOOL_IDS.has(id);
    });
    if (parts.length === message.parts.length) return message;
    changed = true;
    return { ...message, parts } as M;
  });
  return changed ? out : [...messages];
}
