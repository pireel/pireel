import type { ToolPartLike } from './chat-tool-parts';

/** Retain the diagnostics in model/history receipts; do not drop data.issues at the chat boundary. */
export function studioToolFailureText(error: string, data?: unknown): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return error;
  const source = data as Record<string, unknown>;
  const diagnostics = Object.fromEntries(['blockId', 'clipId', 'issues', 'code', 'detail', 'path', 'fix', 'allowed']
    .filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  return Object.keys(diagnostics).length ? `${error}\n${JSON.stringify(diagnostics).slice(0, 12000)}` : error;
}

function componentTarget(part: ToolPartLike): string | null {
  const tool = part.type === 'dynamic-tool' ? part.toolName : part.type.replace(/^tool-/, '');
  if (!['apply_component', 'apply_block', 'edit_block'].includes(tool ?? '')) return null;
  const id = part.input?.clipId ?? part.input?.blockId;
  return typeof id === 'string' && id ? id : null;
}

function failed(part: ToolPartLike): boolean {
  return part.state === 'output-error' || (part.state === 'output-available' && (part.output as { ok?: boolean } | undefined)?.ok === false);
}

/** Display projection only: an actual retry supersedes an earlier failed attempt for the same
 * component. Final errors, other targets and unrelated operations stay visible; history is intact. */
export function collapsedComponentRetryIndexes(parts: readonly ToolPartLike[]): Set<number> {
  const collapsed = new Set<number>();
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    const target = componentTarget(part);
    if (!target || !failed(part)) continue;
    let next = index + 1;
    while (next < parts.length && (parts[next]!.type === 'step-start' || parts[next]!.type === 'reasoning' || parts[next]!.type === 'text')) next++;
    if (next < parts.length && componentTarget(parts[next]!) === target) {
      for (let hidden = index; hidden < next; hidden++) collapsed.add(hidden);
    }
  }
  return collapsed;
}
