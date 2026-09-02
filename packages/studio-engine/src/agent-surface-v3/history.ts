/**
 * Agent surface v3 — persisted chat history compatibility.
 *
 * Threads saved before the cut carry tool parts named after legacy tools (`tool-get_timeline`,
 * `tool-cut_narration`). Fed back to the model unchanged they teach it names the surface no longer
 * has. Before the model sees history, legacy tool parts are renamed to the v3 tool that absorbed
 * them and retired planning tools are dropped; inputs and outputs travel unchanged (receipts are
 * data the model reads, not calls it repeats). The stored thread is never rewritten.
 */

import { V3_RETIRED_TOOL_IDS, V3_TOOL_IDS, v3ReplacementIndex } from './registry';

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

const RETIRED = new Set<string>(V3_RETIRED_TOOL_IDS);

function legacyToolIdOf(part: PartLike): string | null {
  if (part.type === 'dynamic-tool' && typeof part.toolName === 'string') return part.toolName;
  if (part.type.startsWith('tool-')) return part.type.slice('tool-'.length);
  return null;
}

/** Rename legacy tool parts to their v3 tool and drop retired ones. Returns the same array when nothing changed. */
export function remapLegacyToolParts<M extends MessageLike>(messages: readonly M[]): M[] {
  const index = v3ReplacementIndex();
  let changed = false;
  const out = messages.map((message) => {
    if (message.role !== 'assistant') return message;
    let touched = false;
    const parts: PartLike[] = [];
    for (const part of message.parts) {
      const id = legacyToolIdOf(part);
      if (!id || V3_TOOL_IDS.has(id)) { parts.push(part); continue; }
      touched = true;
      if (RETIRED.has(id)) continue;
      const target = index.get(id);
      if (!target) { parts.push(part); touched = false; continue; }
      parts.push(part.type === 'dynamic-tool' ? { ...part, toolName: target } : { ...part, type: `tool-${target}` });
    }
    if (!touched) return message;
    changed = true;
    return { ...message, parts } as M;
  });
  return changed ? out : [...messages];
}
