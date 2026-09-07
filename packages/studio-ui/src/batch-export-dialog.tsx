'use client';

import { AlertCircle, Check, Download, FileVideo2, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { imageThumb } from '@pireel/ui/image-url';
import type { ExportRenderOpts } from './client-export';
import { t } from './i18n';
import type { ProjectOutputTab } from './project-output-switcher';
import { ExportOptRow } from './workbench-controls';

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

const thumbSrc = (cover: string) => (/^(?:data:|blob:|https?:)/.test(cover) ? cover : imageThumb(cover, 'list'));

/**
 * Batch export dialog: pick outputs (versions with content only), share one render config, then
 * watch the sequential run in place. While running only "cancel" can close it (overlay/Esc blocked),
 * mirroring the single-export dialog.
 */
export function BatchExportDialog({
  open,
  onOpenChange,
  outputs,
  selected,
  onToggleSelect,
  onToggleAll,
  opts,
  onOptsChange,
  batch,
  exportPct,
  onStart,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exportable outputs only (a version with no duration has nothing to render). */
  outputs: ProjectOutputTab[];
  selected: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (all: boolean) => void;
  opts: ExportRenderOpts;
  onOptsChange: (next: ExportRenderOpts) => void;
  batch: OutputBatchState | null;
  /** Current item's export progress 0–100 (only meaningful while the batch is running). */
  exportPct: number;
  onStart: () => void;
  onCancel: () => void;
}) {
  const running = !!batch?.running;
  const selectedCount = outputs.reduce((n, o) => n + (selected.has(o.id) ? 1 : 0), 0);
  const allSelected = outputs.length > 0 && selectedCount === outputs.length;
  const rows = batch ? outputs.filter((o) => selected.has(o.id)) : outputs;

  const status = (id: string): 'pending' | 'running' | 'done' | 'failed' => {
    if (!batch) return 'pending';
    if (batch.currentId === id) return 'running';
    if (batch.doneIds.includes(id)) return 'done';
    if (batch.failedIds.includes(id)) return 'failed';
    return 'pending';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && running) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[360px]" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>{t('workbench.batchExport')}</DialogTitle>
        </DialogHeader>
        {batch ? (
          <div className="flex flex-col gap-3">
            <div className="bg-line h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${((batch.done + (running ? exportPct / 100 : 0)) / Math.max(1, batch.total)) * 100}%` }}
              />
            </div>
            <p className="text-ink-3 text-[12px] tabular-nums">
              {running
                ? t('workbench.batchExportProgress', { done: batch.done, total: batch.total, pct: Math.round(exportPct) })
                : t('workbench.batchExportSummary', { done: batch.doneIds.length, failed: batch.failedIds.length })}
            </p>
            <ul className="scrollbar-none flex max-h-56 flex-col gap-1 overflow-y-auto">
              {rows.map((output) => {
                const s = status(output.id);
                return (
                  <li key={output.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px]">
                    <OutputThumb output={output} />
                    <span className={`min-w-0 flex-1 truncate ${s === 'pending' ? 'text-ink-3' : 'text-ink'}`}>
                      {output.title || t('workbench.untitledOutput')}
                    </span>
                    {s === 'running' && <Loader2 size={13} className="text-ink-2 shrink-0 animate-spin" />}
                    {s === 'done' && <Check size={13} className="shrink-0 text-emerald-600" />}
                    {s === 'failed' && <AlertCircle size={13} className="shrink-0 text-red-500" />}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                if (running) onCancel();
                else onOpenChange(false);
              }}
              className="border-line text-ink-2 hover:text-ink inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px]"
            >
              {running ? (
                <>
                  <X size={14} /> {t('workbench.cancelBatchExport')}
                </>
              ) : (
                t('workbench.close')
              )}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-ink-4 text-[11px] leading-relaxed">{t('workbench.batchExportHint')}</p>
            {outputs.length ? (
              <>
                <label className="border-line flex cursor-pointer items-center gap-2 border-b pb-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked)}
                    className="accent-ink h-3.5 w-3.5"
                  />
                  <span className="text-ink-2">{t('workbench.batchExportAll', { n: outputs.length })}</span>
                  <span className="text-ink-4 ml-auto tabular-nums">{t('workbench.outputsSelected', { n: selectedCount })}</span>
                </label>
                <ul className="scrollbar-none flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {outputs.map((output) => (
                    <li key={output.id}>
                      <label className="hover:bg-panel-2 flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[12px]">
                        <input
                          type="checkbox"
                          checked={selected.has(output.id)}
                          onChange={() => onToggleSelect(output.id)}
                          className="accent-ink h-3.5 w-3.5"
                        />
                        <OutputThumb output={output} />
                        <span className="text-ink min-w-0 flex-1 truncate">{output.title || t('workbench.untitledOutput')}</span>
                        {output.durationSec ? (
                          <span className="text-ink-4 shrink-0 font-mono text-[11px] tabular-nums">{fmtDur(output.durationSec)}</span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-ink-3 text-[12px]">{t('workbench.batchExportNoOutputs')}</p>
            )}
            <ExportOptRow
              label={t('chatGen.resolution')}
              value={opts.res}
              options={[
                [2160, '4K'],
                [1440, '2K'],
                [1080, '1080p'],
                [720, '720p'],
                [540, '540p'],
              ]}
              onPick={(res) => onOptsChange({ ...opts, res })}
            />
            <ExportOptRow
              label={t('workbench.frameRate')}
              value={opts.fps}
              options={[
                [24, '24'],
                [30, '30'],
                [60, '60'],
              ]}
              onPick={(fps) => onOptsChange({ ...opts, fps })}
            />
            <ExportOptRow
              label={t('workbench.format')}
              value={opts.format}
              options={[
                ['mp4', 'MP4'],
                ['mov', 'MOV'],
                ['webm', 'WebM'],
              ]}
              onPick={(format) => onOptsChange({ ...opts, format })}
            />
            <button
              type="button"
              disabled={!selectedCount}
              onClick={onStart}
              className="bg-ink text-bg inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} /> {t('workbench.startExport')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OutputThumb({ output }: { output: ProjectOutputTab }) {
  return (
    <span className="bg-panel-2 flex h-7 w-12 shrink-0 items-center justify-center overflow-hidden rounded">
      {output.coverThumb ? (
        <img src={thumbSrc(output.coverThumb)} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <FileVideo2 size={12} className="text-ink-4" />
      )}
    </span>
  );
}
