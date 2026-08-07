'use client';

/**
 * Component-tool receipt body: live preview of produced or changed blocks, one per page.
 * - Pager sits bottom-right; only the CURRENT page mounts a preview iframe (flipping loads the next —
 *   a wall of sandboxed iframes in the chat column would be the timeline-thumbnail lesson all over again).
 * - Previews appear as results land (re-render driven by the tool-progress store during the run,
 *   by the receipt part after it).
 * - LLM-generated markup previews ONLY through the BlockPreviewFrame sandbox (trust boundary).
 */

import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Composition } from '@pireel/studio-engine/composition';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { BlockPreviewFrame } from './block-preview-card';
import { blockDisplayTitle } from './block-display-title';
import { useToolProgress } from './tool-progress';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

export function GraphicsPreviewBody({ toolId, part, getComp }: { toolId: string; part: ToolPartLike; getComp: () => Composition }) {
  // Progress subscription doubles as the live re-render source: each landed fill reports progress,
  // which re-renders this card, which re-reads the comp — no comp→chat prop link needed (chat is
  // deliberately memo-isolated from workbench re-renders).
  const prog = useToolProgress(toolId);
  const out = part.output as StudioToolResult | undefined;
  const outData = out?.data as { blocks?: unknown; blockId?: unknown; newBlockId?: unknown } | undefined;
  const inp = part.input as { blockId?: unknown; blockIds?: unknown } | undefined;
  // Message parts keep what the model actually sent, which may carry the chat's @id pill prefix —
  // strip it here like the tool runner does, or an @-called tool renders no preview.
  const deAt = (s: string) => (s.startsWith('@') ? s.slice(1) : s);
  const arr = (v: unknown) => (Array.isArray(v) && v.length ? v.map((x) => deAt(String(x))) : null);
  const single = (v: unknown) => (typeof v === 'string' && v ? [deAt(v)] : null);
  // Batch tools carry ids in the receipt/progress; single-component tools (edit/duplicate/add) name
  // their target in the input — the chain covers both from the moment the call starts.
  const resolved = arr(outData?.blocks) ?? single(outData?.blockId) ?? single(outData?.newBlockId) ?? prog?.blockIds ?? arr(inp?.blockIds) ?? single(inp?.blockId) ?? [];
  // Sticky: at completion there is a frame where progress is already cleared but the receipt hasn't
  // applied yet — without this the ids collapse to empty and the strip flickers to nothing (the
  // "gone until refresh" report). A batch's ids never change once known, so remembering them is safe.
  const stickyRef = useRef<string[]>([]);
  if (resolved.length) stickyRef.current = resolved;
  const ids = resolved.length ? resolved : stickyRef.current;
  const comp = getComp();
  const blocks = ids.flatMap((id) => {
    const b = comp.blocks.find((x) => x.id === id);
    return b ? [b] : [];
  });
  const [page, setPage] = useState(0);
  // Card width tracks the chat column (user-resizable panel). Callback ref, NOT an effect: this
  // component returns null on the first render (ids not resolved yet), so an effect keyed to mount
  // would attach the observer to a null ref and never re-run once the strip finally renders — w
  // stayed 0 forever and the preview never painted live (only a fresh mount after refresh worked).
  // The callback ref fires whenever the measured node actually attaches, however late.
  const [w, setW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    roRef.current = ro;
  }, []);

  if (!blocks.length) return null;
  const cur = Math.min(page, blocks.length - 1);
  const block = blocks[cur]!;
  const title = blockDisplayTitle(block);
  const H = Math.round(Math.min(Math.max(w * 0.62, 120), 240));
  const focus = block.box
    ? { x: block.box.x * comp.width, y: block.box.y * comp.height, w: block.box.w * comp.width, h: block.box.h * comp.height }
    : undefined;

  return (
    <div ref={measureRef} className="border-line/70 border-t">
      {w > 0 && <BlockPreviewFrame comp={comp} block={block} width={w} height={H} focus={focus} focusContent={!focus} animate="hover" />}
      <div className="border-line/70 text-ink-3 flex items-center gap-2 border-t px-2.5 py-1 text-[11px]">
        <span className="truncate" title={title}>{title}</span>
        {blocks.length > 1 && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, cur - 1))}
              disabled={cur === 0}
              title={t('chatGen.prevComponent')}
              className="hover:bg-line rounded p-0.5 disabled:opacity-30"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="tabular-nums">
              {cur + 1}/{blocks.length}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(blocks.length - 1, cur + 1))}
              disabled={cur === blocks.length - 1}
              title={t('chatGen.nextComponent')}
              className="hover:bg-line rounded p-0.5 disabled:opacity-30"
            >
              <ChevronRight size={12} />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
