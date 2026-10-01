'use client';

/** Progress and result of "export for other editors": what is happening, cancel, then what did not carry over. */

import { CheckCircle2, Loader2 } from 'lucide-react';
import type { NleNote } from '@pireel/studio-engine/nle-export/index';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pireel/ui/dialog';
import type { NleExportStage } from './nle-export-package';
import { t } from './i18n';

export type NleExportState =
  | { phase: 'running'; stage: NleExportStage; pct: number }
  | { phase: 'done'; notes: NleNote[]; fileName: string }
  | { phase: 'error'; message: string };

export function NleExportDialog({ state, onCancel, onClose }: {
  state: NleExportState | null;
  onCancel: () => void;
  onClose: () => void;
}) {
  const running = state?.phase === 'running';
  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open && !running) onClose(); }}>
      <DialogContent className="bg-panel border-line w-[min(440px,calc(100vw-2rem))] gap-0 p-5">
        <DialogTitle className="text-ink text-[15px]">{t('nleExport.title')}</DialogTitle>
        <DialogDescription className="text-ink-3 mt-1 text-[12px] leading-relaxed">{t('nleExport.subtitle')}</DialogDescription>
        {state?.phase === 'running' && (
          <div className="mt-5">
            <div className="text-ink-2 flex items-center gap-2 text-[12px]">
              <Loader2 size={13} className="animate-spin" />
              {t(`nleExport.stage.${state.stage}`)}
              <span className="text-ink-4 ml-auto tabular-nums">{state.pct}%</span>
            </div>
            <div className="bg-panel-2 mt-2 h-1.5 overflow-hidden rounded-full">
              <div className="bg-ink h-full rounded-full transition-[width]" style={{ width: `${state.pct}%` }} />
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onCancel} className="text-ink-3 hover:text-ink rounded-md px-3 py-1.5 text-[12px]">{t('panels.cancel')}</button>
            </div>
          </div>
        )}
        {state?.phase === 'done' && (
          <div className="mt-5">
            <div className="text-ink flex items-center gap-2 text-[12.5px]">
              <CheckCircle2 size={15} className="text-emerald-500" />
              {t('nleExport.done', { file: state.fileName })}
            </div>
            <p className="text-ink-3 mt-2 text-[12px] leading-relaxed">{t('nleExport.doneHint')}</p>
            {state.notes.length > 0 && (
              <div className="mt-3">
                <div className="text-ink-2 text-[12px] font-medium">{t('nleExport.readmeNotesTitle')}</div>
                <ul className="text-ink-3 mt-1 list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed">
                  {state.notes.map((note) => (
                    <li key={note.code}>
                      {t(`nleExport.note.${note.code.replace(/-/g, '_')}`)}
                      {note.items?.length ? `: ${note.items.join(', ')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="bg-ink text-canvas rounded-md px-3.5 py-1.5 text-[12px] font-medium">{t('nleExport.close')}</button>
            </div>
          </div>
        )}
        {state?.phase === 'error' && (
          <div className="mt-5">
            <p className="text-destructive text-[12px] leading-relaxed">{t('nleExport.failed', { message: state.message })}</p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink rounded-md px-3 py-1.5 text-[12px]">{t('nleExport.close')}</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
