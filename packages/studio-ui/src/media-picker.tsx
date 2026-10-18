import { type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

export function SceneMediaCard({ name, children, onRemove, disabled, locale, status = 'done', error }: {
  name: string; children: ReactNode; onRemove?: () => void; disabled: boolean; locale: 'zh' | 'en'; status?: string; error?: string;
}) {
  return <div className="group relative min-w-0" data-upload-status={status}>
    <div className="bg-panel relative aspect-[1.15] overflow-hidden rounded-lg">{children}</div>
    <span className="text-ink-3 mt-1 block truncate text-[11px]" title={error ?? name}>{name}</span>
    {onRemove && <button type="button" disabled={disabled} aria-label={`${locale === 'zh' ? '移除' : 'Remove'} ${name}`} onClick={onRemove} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"><X size={12} /></button>}
  </div>;
}

export function SceneMediaPicker({ children, hasItems, disabled, locale, onAdd, onFiles, labels, bare = false }: {
  children: ReactNode; hasItems: boolean; disabled: boolean; locale: 'zh' | 'en'; onAdd: () => void; onFiles?: (files: File[]) => void;
  /** Wording for a picker that holds something other than footage (e.g. reference images). */
  labels?: { title: string; upload: string; empty: string };
  /** No title row: a dashed "add" box, and a dashed add tile after the cards. */
  bare?: boolean;
}) {
  const zh = locale === 'zh';
  if (bare) return <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) onFiles?.(Array.from(event.dataTransfer.files)); }}>
    {hasItems ? <div role="region" aria-label={zh ? '素材列表' : 'Footage cards'} className="grid gap-x-1.5 gap-y-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(64px, 100%), 1fr))' }}>
      {children}
      <button type="button" disabled={disabled} onClick={onAdd} aria-label={zh ? '添加素材' : 'Add footage'} className="border-line text-ink-3 hover:text-ink flex aspect-[1.15] items-center justify-center rounded-lg border border-dashed disabled:opacity-50"><Plus size={16}/></button>
    </div>
    : <button type="button" disabled={disabled} onClick={onAdd} className="border-line text-ink-3 hover:text-ink flex min-h-16 w-full items-center justify-center gap-1.5 rounded-md border border-dashed text-xs disabled:opacity-50"><Plus size={15}/>{zh ? '去添加' : 'Add'}</button>}
  </div>;
  return <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) onFiles?.(Array.from(event.dataTransfer.files)); }}>
    <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-ink">{labels?.title ?? (zh ? '我的素材' : 'My footage')}</span><button type="button" disabled={disabled} onClick={onAdd} className="text-ink-3 inline-flex items-center gap-1 text-xs"><Plus size={14}/>{labels?.upload ?? (zh ? '上传素材' : 'Upload footage')}</button></div>
    <div role="region" aria-label={zh ? '素材列表' : 'Footage cards'} className="grid gap-x-1.5 gap-y-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(64px, 100%), 1fr))' }}>{children}</div>
    {!hasItems && <button type="button" disabled={disabled} onClick={onAdd} className="bg-panel-2 text-ink-3 flex min-h-16 w-full items-center justify-center gap-2 rounded-md text-xs"><Plus size={16}/>{labels?.empty ?? (zh ? '添加图片或视频' : 'Add images or videos')}</button>}
  </div>;
}
