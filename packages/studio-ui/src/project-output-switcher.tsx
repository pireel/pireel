'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface ProjectOutputTab {
  id: string;
  title: string;
  coverThumb: string | null;
  durationSec: number | null;
  canvasWidth: number;
  canvasHeight: number;
}

/** Reveal a tab by scrolling this strip only, without moving the workbench or timeline. */
export function projectOutputRevealScrollLeft(
  currentScrollLeft: number,
  viewport: Pick<DOMRect, 'left' | 'right'>,
  item: Pick<DOMRect, 'left' | 'right'>,
): number {
  if (item.left < viewport.left) return Math.max(0, currentScrollLeft + item.left - viewport.left);
  if (item.right > viewport.right) return currentScrollLeft + item.right - viewport.right;
  return currentScrollLeft;
}

/** Independent edits share a project library; each tab opens its own timeline. */
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
  leading,
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
  /** Controls before the tabs (e.g. the timeline collapse toggle). */
  leading?: ReactNode;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const disabled = switching || locked;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const reveal = () => {
      const active = strip.querySelector<HTMLElement>(`[data-output-id="${CSS.escape(activeId)}"]`);
      if (!active) return;
      strip.scrollLeft = projectOutputRevealScrollLeft(strip.scrollLeft, strip.getBoundingClientRect(), active.getBoundingClientRect());
    };
    reveal();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeId, outputs.length]);

  return (
    <nav data-cap-keep data-output-tabs aria-label={label} className="border-line bg-panel flex h-[30px] min-w-0 shrink-0 items-stretch rounded-t-sm border-b px-2">
      {leading ? <div className="mr-1 flex shrink-0 items-center">{leading}</div> : null}
      <div
        ref={stripRef}
        data-output-list
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        aria-busy={switching || undefined}
        className="scrollbar-none flex min-w-0 items-stretch overflow-x-auto"
        onKeyDown={(event) => {
          if (disabled || !(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'tab') return;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          const strip = stripRef.current;
          if (!strip) return;
          const tabs = [...strip.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const current = tabs.indexOf(event.target as HTMLButtonElement);
          if (current < 0) return;
          event.preventDefault();
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          const next = tabs[index]!;
          next.focus({ preventScroll: true });
          strip.scrollLeft = projectOutputRevealScrollLeft(strip.scrollLeft, strip.getBoundingClientRect(), next.parentElement!.getBoundingClientRect());
        }}
      >
        {outputs.map((output, index) => {
          const active = output.id === activeId;
          const title = output.title || `${untitledLabel} ${index + 1}`;
          return (
            <div key={output.id} role="presentation" data-output-id={output.id} className={`group relative flex min-w-28 max-w-52 shrink-0 items-stretch border-b-2 ${active ? 'border-ink bg-canvas text-ink' : 'border-transparent text-ink-3 hover:bg-canvas/60 hover:text-ink'}`}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={title}
                tabIndex={active ? 0 : -1}
                title={locked && lockedHint ? lockedHint : title}
                disabled={disabled}
                onClick={() => onSwitch(output.id)}
                className="min-w-0 flex-1 truncate px-3 text-left text-[11.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 disabled:cursor-wait disabled:opacity-50"
              >
                {title}
              </button>
              {outputs.length > 1 && (
                <button
                  type="button"
                  data-output-delete
                  aria-label={`${deleteLabel}: ${title}`}
                  title={deleteLabel}
                  disabled={disabled}
                  onClick={() => onDelete(output.id)}
                  className="text-ink-4 hover:text-destructive mr-1 my-auto flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 hover:bg-panel-2 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-wait disabled:opacity-40"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        data-output-create
        aria-label={newLabel}
        title={locked && lockedHint ? lockedHint : newLabel}
        disabled={disabled}
        onClick={onCreate}
        className="text-ink-3 hover:bg-panel-2 hover:text-ink my-auto ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-wait disabled:opacity-50"
      >
        <Plus size={14} />
      </button>
    </nav>
  );
}
