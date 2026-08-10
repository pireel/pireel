'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Check, Download, FileVideo2, ListChecks, Loader2, Plus, Trash2, X } from 'lucide-react';
import { t } from './i18n';

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

/** Sequential batch export progress (one output at a time through the ordinary switch→export pipeline). */
export interface OutputBatchState {
  running: boolean;
  total: number;
  done: number;
  currentId: string | null;
  doneIds: readonly string[];
  failedIds: readonly string[];
}

const fmtDur = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Output rail. The add and batch-mode actions stay fixed above a vertically scrolling list;
 * cards preserve each output canvas ratio and the rail itself deliberately has no surface.
 */
export function ProjectOutputSwitcher({
  outputs,
  activeId,
  label,
  newLabel,
  deleteLabel,
  untitledLabel,
  batchMode,
  switching,
  selected,
  batch,
  exportPct,
  onSwitch,
  onCreate,
  onDelete,
  onToggleBatchMode,
  onToggleSelect,
  onExportSelected,
  onCancelBatch,
}: {
  outputs: ProjectOutputTab[];
  activeId: string;
  label: string;
  newLabel: string;
  deleteLabel: string;
  untitledLabel: string;
  batchMode: boolean;
  switching?: boolean;
  selected: ReadonlySet<string>;
  batch: OutputBatchState | null;
  /** Current item's export progress 0–100 (only meaningful while batch is running). */
  exportPct: number;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onToggleBatchMode: () => void;
  onToggleSelect: (id: string) => void;
  onExportSelected: () => void;
  onCancelBatch: () => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const batchRunning = !!batch?.running;
  // Creating appends at the end and activates it; switching from chat can land on an off-screen tab.
  // Only identity/list changes reveal the active item. UI modes (notably batch selection) must not
  // move anything, and revealing a genuinely off-screen item may scroll this list only — never a
  // Studio ancestor (scrollIntoView would walk and move every scrollable ancestor).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-output-id="${CSS.escape(activeId)}"]`);
    if (!el) return;
    strip.scrollTop = projectOutputRevealScrollTop(
      strip.scrollTop,
      strip.getBoundingClientRect(),
      el.getBoundingClientRect(),
    );
  }, [activeId, outputs.length]);

  const selectedCount = outputs.reduce((n, o) => n + (selected.has(o.id) ? 1 : 0), 0);
  // A version with no duration is empty (no video / no content) and is never part of a batch export.
  const nonEmptyCount = outputs.reduce((n, o) => n + (o.durationSec ? 1 : 0), 0);
  const exportTargetCount = selectedCount
    ? outputs.reduce((n, o) => n + (selected.has(o.id) && o.durationSec ? 1 : 0), 0)
    : nonEmptyCount;
  const busy = switching || batchRunning;

  const renderTab = (output: ProjectOutputTab, index: number) => {
    const active = output.id === activeId;
    const accessibleTitle = output.title || untitledLabel;
    const isSelected = selected.has(output.id);
    const exportingThis = batchRunning && batch?.currentId === output.id;
    const exportDone = !!batch?.doneIds.includes(output.id);
    const exportFailed = !!batch?.failedIds.includes(output.id);
    const thumbGeometry = projectOutputThumbGeometry(output);
    return (
      <div
        key={output.id}
        data-output-id={output.id}
        data-output-nav-item
        className="group relative w-full shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={active}
          aria-label={accessibleTitle}
          title={accessibleTitle}
          disabled={busy}
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
                className={`absolute left-1 top-1 z-10 rounded-sm bg-black/60 px-1 py-0.5 font-mono text-[9px] leading-none tabular-nums text-white/75 backdrop-blur-[2px] ${batchMode ? 'invisible' : ''}`}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              {output.coverThumb ? (
                <img src={output.coverThumb} alt="" className="h-full w-full object-cover" draggable={false} />
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
              {exportingThis && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
                    <Loader2 size={10} className="animate-spin" /> {Math.round(exportPct)}%
                  </span>
                </span>
              )}
              {exportDone && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <Check size={10} />
                </span>
              )}
              {exportFailed && (
                <span title={t('common.exportFailed')} className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
                  <AlertCircle size={10} />
                </span>
              )}
            </span>
          </span>
        </button>
        {batchMode && !batchRunning && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={accessibleTitle}
            disabled={switching}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(output.id);
            }}
            className={`absolute left-2 top-2.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-sm border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
              isSelected ? 'border-ink bg-ink text-bg' : 'border-line-2 bg-panel text-transparent hover:border-ink-3'
            }`}
          >
            <Check size={12} />
          </button>
        )}
        {!batchMode && outputs.length > 1 && !batchRunning && (
          <button
            type="button"
            data-output-delete
            aria-label={`${deleteLabel}: ${accessibleTitle}`}
            title={deleteLabel}
            disabled={switching}
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
      className="border-line bg-panel relative flex h-full min-h-0 w-[clamp(112px,10vw,156px)] shrink-0 flex-col overflow-hidden border-r"
    >
      <div className="flex w-full shrink-0 items-center justify-between px-3 pb-1.5 pt-3">
        <span className="text-ink-3 min-w-0 flex-1 truncate px-1 text-[11px] font-medium tracking-wide">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={newLabel}
            title={newLabel}
            disabled={busy}
            onClick={onCreate}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink flex h-7 w-7 items-center justify-center rounded-md transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-wait disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={t('workbench.batchExport')}
            aria-pressed={batchMode}
            title={t('workbench.batchExport')}
            disabled={batchRunning}
            onClick={onToggleBatchMode}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:opacity-50 ${
              batchMode ? 'bg-panel-2 text-ink' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
            }`}
          >
            <ListChecks size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div
        ref={stripRef}
        data-output-list
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
        className="scrollbar-none flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-2 pb-3"
      >
        {outputs.map((output, index) => renderTab(output, index))}
      </div>
      {(batchMode || batchRunning) && (
        <div className="border-line flex w-full shrink-0 flex-col gap-1.5 border-t px-2 py-2">
          {batchRunning && batch ? (
            <>
              <span className="text-ink-3 flex items-center justify-center gap-1 font-mono text-[9.5px] tabular-nums">
                <Loader2 size={10} className="animate-spin" />
                {batch.done}/{batch.total} · {Math.round(exportPct)}%
              </span>
              <button
                type="button"
                onClick={onCancelBatch}
                title={t('workbench.cancelBatchExport')}
                aria-label={t('workbench.cancelBatchExport')}
                className="text-ink-3 hover:bg-panel hover:text-ink flex h-7 w-full items-center justify-center rounded-md"
              >
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <span className="text-ink-3 truncate text-center text-[9.5px]">
                {selectedCount ? t('workbench.outputsSelected', { n: selectedCount }) : t('workbench.batchExportAll', { n: nonEmptyCount })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!exportTargetCount || switching}
                  onClick={onExportSelected}
                  title={t('workbench.batchExport')}
                  aria-label={t('workbench.batchExport')}
                  className="bg-ink text-bg flex h-7 min-w-0 flex-1 items-center justify-center rounded-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={12} />
                </button>
                <button
                  type="button"
                  onClick={onToggleBatchMode}
                  title={t('workbench.cancelBatchExport')}
                  aria-label={t('workbench.cancelBatchExport')}
                  className="text-ink-3 hover:bg-panel hover:text-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                >
                  <X size={12} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
