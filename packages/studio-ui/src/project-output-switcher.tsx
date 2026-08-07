'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Download, FileVideo2, Loader2, Plus, Trash2, X } from 'lucide-react';
import { t } from './i18n';

export interface ProjectOutputTab {
  id: string;
  title: string;
  coverThumb: string | null;
  durationSec: number | null;
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
 * Output tabs pill. Collapsed = one scrollable row of small thumbs. Expanded = a max-width,
 * fixed-height card grid that scrolls in place (video-ratio thumbs with the title beneath), plus a
 * batch-export action row — the preview and timeline stay untouched (clicking a card is the
 * ordinary output switch).
 */
export function ProjectOutputSwitcher({
  outputs,
  activeId,
  label,
  newLabel,
  deleteLabel,
  untitledLabel,
  expandLabel,
  collapseLabel,
  expanded,
  switching,
  selected,
  batch,
  exportPct,
  onSwitch,
  onCreate,
  onDelete,
  onToggleExpanded,
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
  expandLabel: string;
  collapseLabel: string;
  expanded: boolean;
  switching?: boolean;
  selected: ReadonlySet<string>;
  batch: OutputBatchState | null;
  /** Current item's export progress 0–100 (only meaningful while batch is running). */
  exportPct: number;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onToggleExpanded: () => void;
  onToggleSelect: (id: string) => void;
  onExportSelected: () => void;
  onCancelBatch: () => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const batchRunning = !!batch?.running;
  // Creating appends at the end and activates it; switching from chat can land on an off-screen tab.
  // Either way the active tab must end up visible, so follow activeId (length covers recreate-same-id edges).
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-output-id="${CSS.escape(activeId)}"]`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId, outputs.length, expanded]);

  const selectedCount = outputs.reduce((n, o) => n + (selected.has(o.id) ? 1 : 0), 0);
  // A version with no duration is empty (no video / no content) and is never part of a batch export.
  const nonEmptyCount = outputs.reduce((n, o) => n + (o.durationSec ? 1 : 0), 0);
  const exportTargetCount = selectedCount
    ? outputs.reduce((n, o) => n + (selected.has(o.id) && o.durationSec ? 1 : 0), 0)
    : nonEmptyCount;
  const busy = switching || batchRunning;

  const renderTab = (output: ProjectOutputTab, index: number, big: boolean) => {
    const active = output.id === activeId;
    const accessibleTitle = output.title || untitledLabel;
    const isSelected = selected.has(output.id);
    const exportingThis = batchRunning && batch?.currentId === output.id;
    const exportDone = !!batch?.doneIds.includes(output.id);
    const exportFailed = !!batch?.failedIds.includes(output.id);
    return (
      <div key={output.id} data-output-id={output.id} className={`group relative ${big ? 'w-full' : 'shrink-0'}`}>
        <button
          type="button"
          role="tab"
          aria-selected={active}
          aria-label={accessibleTitle}
          title={accessibleTitle}
          disabled={busy}
          onClick={() => onSwitch(output.id)}
          className={`flex rounded-lg border p-1 transition-[border-color,background-color,box-shadow,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-wait ${
            big ? 'w-full flex-col items-stretch' : 'items-center'
          } ${
            active ? 'border-ink/70 bg-panel-2 shadow-sm' : 'border-transparent hover:border-line-2 hover:bg-panel-2'
          }`}
        >
          <span className={`bg-panel-2 relative flex ${big ? 'aspect-video w-full' : 'h-10 aspect-video shrink-0'} items-center justify-center overflow-hidden rounded-md`}>
            {output.coverThumb ? (
              <img src={output.coverThumb} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <FileVideo2 size={big ? 20 : 16} className="text-ink-4" />
            )}
            <span className="absolute bottom-1 left-1 flex h-4 min-w-4 items-center justify-center rounded bg-black/70 px-1 font-mono text-[9px] font-medium leading-none text-white shadow-sm">
              {index + 1}
            </span>
            {big && output.durationSec != null && (
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 font-mono text-[9px] leading-none text-white tabular-nums">
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
          {big && <span className="text-ink-2 mt-1 w-full truncate text-center text-[11px] font-medium">{accessibleTitle}</span>}
        </button>
        {big && !batchRunning && (
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
            className={`absolute left-2 top-2 z-10 flex h-[18px] w-[18px] items-center justify-center rounded border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
              isSelected ? 'border-white bg-white text-black' : 'border-white/70 bg-black/45 text-transparent hover:border-white'
            }`}
          >
            <Check size={12} />
          </button>
        )}
        {outputs.length > 1 && !batchRunning && (
          <button
            type="button"
            aria-label={`${deleteLabel}: ${accessibleTitle}`}
            title={deleteLabel}
            disabled={switching}
            onClick={() => onDelete(output.id)}
            className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-black/70 text-white opacity-0 shadow-sm transition-[background-color,opacity,transform] hover:bg-red-600 active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 group-focus-within:opacity-100 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-0"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      data-cap-keep
      role="tablist"
      aria-label={label}
      className={`border-line bg-panel/90 relative flex max-w-[min(82%,900px)] rounded-xl border p-1.5 shadow-lg backdrop-blur-md ${
        expanded ? 'w-full flex-col gap-1.5' : 'items-center gap-1.5'
      }`}
    >
      {expanded ? (
        <>
          <div className="flex min-w-0 items-center gap-1.5">
            <div ref={stripRef} className="scrollbar-none grid max-h-64 min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2 overflow-y-auto pr-0.5">
              {outputs.map((output, index) => renderTab(output, index, true))}
            </div>
          </div>
          {/* Batch export action row */}
          <div className="border-line flex items-center gap-2 border-t px-0.5 pt-1.5">
            <span className="text-ink-3 text-[11.5px]">{selectedCount ? t('workbench.outputsSelected', { n: selectedCount }) : t('workbench.batchExportAll', { n: nonEmptyCount })}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label={newLabel}
                title={newLabel}
                disabled={busy}
                onClick={onCreate}
                className="text-ink-3 hover:bg-panel-2 hover:text-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-wait disabled:opacity-50"
              >
                <Plus size={15} />
              </button>
              {batchRunning && batch ? (
                <>
                  <span className="text-ink-3 flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                    <Loader2 size={11} className="animate-spin" />
                    {batch.done}/{batch.total} · {Math.round(exportPct)}%
                  </span>
                  <button
                    type="button"
                    onClick={onCancelBatch}
                    title={t('workbench.cancelBatchExport')}
                    aria-label={t('workbench.cancelBatchExport')}
                    className="text-ink-3 hover:text-ink rounded p-1"
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!exportTargetCount || switching}
                  onClick={onExportSelected}
                  className="bg-ink text-bg flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={12} /> {t('workbench.batchExport')}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div ref={stripRef} className="scrollbar-none flex min-w-0 items-center gap-1.5 overflow-x-auto">
            {outputs.map((output, index) => renderTab(output, index, false))}
          </div>
          <span className="bg-line h-6 w-px shrink-0" />
          <button
            type="button"
            aria-label={newLabel}
            title={newLabel}
            disabled={busy}
            onClick={onCreate}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink flex h-12 w-10 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-wait disabled:opacity-50"
          >
            <Plus size={17} />
          </button>
        </>
      )}
      {/* Expand toggle: hangs off the bottom-center edge of the pill; expanded = fixed-height scrollable list, in place */}
      <button
        type="button"
        aria-label={expanded ? collapseLabel : expandLabel}
        aria-expanded={expanded}
        title={expanded ? collapseLabel : expandLabel}
        disabled={batchRunning}
        onClick={onToggleExpanded}
        className="border-line bg-panel text-ink-3 hover:text-ink absolute -bottom-3 left-1/2 flex h-5 w-9 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:opacity-50"
      >
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
    </div>
  );
}
