import { type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { t } from './i18n';

export function SceneMediaCard({ name, children, onRemove, onOpen, disabled, status = 'done', error }: {
  name: string; children: ReactNode; onRemove?: () => void; disabled: boolean; status?: string; error?: string;
  /** Opens the file in a viewer; the whole thumbnail is its button (under any status overlay). */
  onOpen?: () => void;
}) {
  return <div className="group relative min-w-0" data-upload-status={status}>
    <div className="bg-panel relative aspect-[1.15] overflow-hidden rounded-lg">
      {onOpen && <button type="button" aria-label={`${t('ui.mediaPicker.preview')} ${name}`} onClick={onOpen} className="absolute inset-0 z-0 cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" />}
      {children}
    </div>
    <span className="text-ink-3 mt-1 block truncate text-[11px]" title={error ?? name}>{name}</span>
    {onRemove && <button type="button" disabled={disabled} aria-label={`${t('ui.mediaPicker.remove')} ${name}`} onClick={onRemove} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"><X size={12} /></button>}
  </div>;
}

export function SceneMediaPicker({ children, hasItems, disabled, onAdd, onFiles, labels, bare = false }: {
  children: ReactNode; hasItems: boolean; disabled: boolean; onAdd: () => void; onFiles?: (files: File[]) => void;
  /** Wording for a picker that holds something other than footage (e.g. reference images). */
  labels?: { title: string; upload: string; empty: string };
  /** No title row: a dashed "add" box, and a dashed add tile after the cards. */
  bare?: boolean;
}) {
  if (bare) return <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) onFiles?.(Array.from(event.dataTransfer.files)); }}>
    {hasItems ? <div role="region" aria-label={t('ui.mediaPicker.footageCards')} className="grid gap-x-1.5 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(64px, 100%), 1fr))' }}>
      {children}
      <button type="button" disabled={disabled} onClick={onAdd} aria-label={t('ui.mediaPicker.addFootage')} className="border-line text-ink-3 hover:text-ink flex aspect-[1.15] items-center justify-center rounded-lg border border-dashed disabled:opacity-50"><Plus size={16}/></button>
    </div>
    : <button type="button" disabled={disabled} onClick={onAdd} className="border-line text-ink-3 hover:text-ink flex min-h-16 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs disabled:opacity-50"><Plus size={15}/>{t('ui.mediaPicker.add')}</button>}
  </div>;
  return <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) onFiles?.(Array.from(event.dataTransfer.files)); }}>
    <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-ink">{labels?.title ?? (t('ui.mediaPicker.myFootage'))}</span><button type="button" disabled={disabled} onClick={onAdd} className="text-ink-3 inline-flex items-center gap-1 text-xs"><Plus size={14}/>{labels?.upload ?? (t('ui.mediaPicker.uploadFootage'))}</button></div>
    <div role="region" aria-label={t('ui.mediaPicker.footageCards')} className="grid gap-x-1.5 gap-y-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(64px, 100%), 1fr))' }}>{children}</div>
    {!hasItems && <button type="button" disabled={disabled} onClick={onAdd} className="bg-panel-2 text-ink-3 flex min-h-16 w-full items-center justify-center gap-2 rounded-md text-xs"><Plus size={16}/>{labels?.empty ?? (t('ui.mediaPicker.addImagesVideos'))}</button>}
  </div>;
}
