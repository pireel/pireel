'use client';

import { useEffect, useRef, useState } from 'react';
import { FileVideo2, Plus, Trash2 } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';

export interface ProjectOutputTab {
  id: string;
  title: string;
  coverThumb: string | null;
  durationSec: number | null;
  canvasWidth: number;
  canvasHeight: number;
}

const DEFAULT_OUTPUT_CANVAS = { width: 16, height: 9 } as const;
const OUTPUT_RAIL_THUMB_MAX_WIDTH = 144;
const OUTPUT_RAIL_THUMB_MAX_HEIGHT = 120;

export function projectOutputThumbGeometry(
  output: Pick<ProjectOutputTab, 'canvasWidth' | 'canvasHeight'>,
): { cssAspectRatio: string; cardWidth: number } {
  const valid = Number.isFinite(output.canvasWidth)
    && output.canvasWidth > 0
    && Number.isFinite(output.canvasHeight)
    && output.canvasHeight > 0;
  const width = valid ? output.canvasWidth : DEFAULT_OUTPUT_CANVAS.width;
  const height = valid ? output.canvasHeight : DEFAULT_OUTPUT_CANVAS.height;
  const ratio = width / height;
  return {
    cssAspectRatio: `${width} / ${height}`,
    cardWidth: Math.min(OUTPUT_RAIL_THUMB_MAX_WIDTH, OUTPUT_RAIL_THUMB_MAX_HEIGHT * ratio),
  };
}

export function projectOutputRevealScrollTop(
  currentScrollTop: number,
  viewport: Pick<DOMRect, 'top' | 'bottom'>,
  item: Pick<DOMRect, 'top' | 'bottom'>,
): number {
  if (item.top < viewport.top) return Math.max(0, currentScrollTop + item.top - viewport.top);
  if (item.bottom > viewport.bottom) return currentScrollTop + item.bottom - viewport.bottom;
  return currentScrollTop;
}

const fmtDur = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Output rail. Cards preserve each output canvas ratio and the create action is the final card.
 * When the list overflows, that action is pinned to the bottom and revealed on rail hover.
 */
export function ProjectOutputSwitcher({
  outputs,
  activeId,
  label,
  newLabel,
  deleteLabel,
  untitledLabel,
  switching,
  locked,
  lockedHint,
  onSwitch,
  onCreate,
  onDelete,
}: {
  outputs: ProjectOutputTab[];
  activeId: string;
  label: string;
  newLabel: string;
  deleteLabel: string;
  untitledLabel: string;
  switching?: boolean;
  /** An agent turn is running: switching/creating/deleting would retarget its remaining tool calls. */
  locked?: boolean;
  lockedHint?: string;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [listOverflowing, setListOverflowing] = useState(false);
  // Creating appends at the end and activates it; switching from chat can land on an off-screen tab.
  // Only identity/list changes reveal the active item. Revealing a genuinely off-screen item may
  // scroll this list only — never a Studio ancestor (scrollIntoView would move every scrollable ancestor).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-output-id="${CSS.escape(activeId)}"]`);
    if (!el) return;
    const viewport = strip.getBoundingClientRect();
    strip.scrollTop = projectOutputRevealScrollTop(
      strip.scrollTop,
      {
        top: viewport.top,
        bottom: viewport.bottom - (listOverflowing ? 76 : 0),
      },
      el.getBoundingClientRect(),
    );
  }, [activeId, listOverflowing, outputs.length]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const update = () => setListOverflowing(strip.scrollHeight > strip.clientHeight + 1);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [outputs.length]);

  const createCard = (
    <button
      type="button"
      data-output-create-card
      aria-label={newLabel}
      title={locked && lockedHint ? lockedHint : newLabel}
      disabled={switching || locked}
      onClick={onCreate}
      className="group/create flex w-full shrink-0 rounded-md px-2 py-1.5 transition-transform active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40 disabled:cursor-wait disabled:opacity-50"
    >
      <span className="bg-panel-2/70 text-ink-3 group-hover/create:bg-panel-2 group-hover/create:text-ink flex h-14 w-full items-center justify-center gap-1.5 rounded-sm text-[11px] font-medium transition-colors">
        <Plus size={14} strokeWidth={1.8} />
        <span>{newLabel}</span>
      </span>
    </button>
  );

  const renderTab = (output: ProjectOutputTab, index: number) => {
    const active = output.id === activeId;
    const accessibleTitle = output.title || untitledLabel;
    const thumbGeometry = projectOutputThumbGeometry(output);
    return (
      <div
        key={output.id}
        data-output-id={output.id}
        data-output-nav-item
        className="group relative w-full shrink-0 px-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active}
          aria-label={accessibleTitle}
          title={locked && lockedHint ? lockedHint : accessibleTitle}
          disabled={switching || locked}
          onClick={() => onSwitch(output.id)}
          className={`relative flex w-full items-start rounded-md px-2 py-1.5 text-left transition-[background-color,transform] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-wait ${
            active ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:bg-panel-2 hover:text-ink'
          }`}
        >
          <span className="flex min-w-0 flex-1 flex-col items-center">
            <span
              data-output-thumb
              className="border-line group-hover:border-line-2 relative flex max-w-full items-center justify-center overflow-hidden rounded-sm border bg-black transition-colors"
              style={{ width: thumbGeometry.cardWidth, aspectRatio: thumbGeometry.cssAspectRatio }}
            >
              <span
                data-output-index
                aria-hidden
                className="absolute left-1 top-1 z-10 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[9px] leading-none tabular-nums text-white/75 backdrop-blur-[2px]"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              {output.coverThumb ? (
                <img src={/^(?:data:|blob:|https?:)/.test(output.coverThumb) ? output.coverThumb : imageThumb(output.coverThumb, 'list')} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <FileVideo2 size={18} className="text-white/45" />
              )}
              {output.durationSec != null && (
                <span
                  data-output-duration
                  className="absolute bottom-1 right-1 rounded-sm bg-black/70 px-1 py-0.5 font-mono text-[9px] leading-none tabular-nums text-white shadow-sm"
                >
                  {fmtDur(output.durationSec)}
                </span>
              )}
            </span>
          </span>
        </button>
        {outputs.length > 1 && (
          <button
            type="button"
            data-output-delete
            aria-label={`${deleteLabel}: ${accessibleTitle}`}
            title={deleteLabel}
            disabled={switching || locked}
            onClick={() => onDelete(output.id)}
            className="border-line bg-panel/95 text-red-500 hover:border-red-500 hover:bg-red-500 hover:text-white absolute right-3 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-sm border opacity-0 shadow-sm backdrop-blur-sm transition-[background-color,border-color,color,opacity,transform] active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 group-focus-within:opacity-100 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-40"
          >
            <Trash2 size={12} strokeWidth={1.9} />
          </button>
        )}
      </div>
    );
  };

  return (
    <aside
      data-cap-keep
      aria-label={label}
      className="group/output-rail bg-canvas relative flex h-full min-h-0 w-[clamp(112px,10vw,156px)] shrink-0 flex-col overflow-hidden"
    >
      <div
        ref={stripRef}
        data-output-list
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
        className={`scrollbar-none flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto pt-1.5 ${listOverflowing ? 'pb-[76px]' : 'pb-3'}`}
      >
        {outputs.map((output, index) => renderTab(output, index))}
        {!listOverflowing && createCard}
      </div>
      {listOverflowing && (
        <div className="bg-canvas pointer-events-none absolute inset-x-0 bottom-0 z-20 pb-3 pt-1.5 opacity-0 translate-y-1 transition-[opacity,transform] duration-150 group-hover/output-rail:pointer-events-auto group-hover/output-rail:translate-y-0 group-hover/output-rail:opacity-100 group-focus-within/output-rail:pointer-events-auto group-focus-within/output-rail:translate-y-0 group-focus-within/output-rail:opacity-100">
          {createCard}
        </div>
      )}
    </aside>
  );
}
