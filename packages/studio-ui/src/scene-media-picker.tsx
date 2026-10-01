import { useEffect, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import type { BrollAsset } from '@pireel/studio-engine/broll-task';
import { loadCaptionMedia } from './caption-task-store';

export function SceneMediaThumb({ asset, scope, fit = 'cover' }: { asset: BrollAsset; scope: string; fit?: 'contain' | 'cover' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true; let value = ''; setUrl('');
    void loadCaptionMedia(scope, asset.sig, asset.name).then(file => {
      if (file && alive) { value = URL.createObjectURL(file); setUrl(value); }
    }).catch(() => {});
    return () => { alive = false; if (value) URL.revokeObjectURL(value); };
  }, [scope, asset.sig, asset.name]);
  return url ? asset.kind === 'image'
    ? <img src={url} alt="" className="pointer-events-none h-full w-full" style={{ objectFit: fit }} />
    : <video src={url} preload="metadata" onLoadedMetadata={event => { if (event.currentTarget.duration > 0) event.currentTarget.currentTime = Math.min(.05, event.currentTarget.duration / 2); }} muted playsInline className="pointer-events-none h-full w-full" style={{ objectFit: fit }} />
    : <div className="bg-panel-2 h-full w-full" />;
}

export function SceneMediaCard({ name, children, onRemove, disabled, locale, status = 'done', error }: {
  name: string; children: ReactNode; onRemove?: () => void; disabled: boolean; locale: 'zh' | 'en'; status?: string; error?: string;
}) {
  return <div className="group relative min-w-0" data-upload-status={status}>
    <div className="bg-panel relative aspect-[1.15] overflow-hidden rounded-lg">{children}</div>
    <span className="text-ink-3 mt-2 block truncate text-xs" title={error ?? name}>{name}</span>
    {onRemove && <button type="button" disabled={disabled} aria-label={`${locale === 'zh' ? '移除' : 'Remove'} ${name}`} onClick={onRemove} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"><X size={12} /></button>}
  </div>;
}

export function SceneMediaPicker({ children, hasItems, disabled, locale, onAdd, onFiles, labels }: {
  children: ReactNode; hasItems: boolean; disabled: boolean; locale: 'zh' | 'en'; onAdd: () => void; onFiles?: (files: File[]) => void;
  /** Wording for a picker that holds something other than footage (e.g. reference images). */
  labels?: { title: string; upload: string; empty: string };
}) {
  const zh = locale === 'zh';
  return <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) onFiles?.(Array.from(event.dataTransfer.files)); }}>
    <div className="mb-3 flex items-center justify-between gap-3 text-sm"><span className="text-ink">{labels?.title ?? (zh ? '我的素材' : 'My footage')}</span><button type="button" disabled={disabled} onClick={onAdd} className="text-ink-3 inline-flex items-center gap-1 text-xs"><Plus size={14}/>{labels?.upload ?? (zh ? '上传素材' : 'Upload footage')}</button></div>
    <div role="region" aria-label={zh ? '素材列表' : 'Footage cards'} className="grid gap-x-1.5 gap-y-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(88px, 100%), 1fr))' }}>{children}</div>
    {!hasItems && <button type="button" disabled={disabled} onClick={onAdd} className="bg-panel-2 text-ink-3 flex min-h-28 w-full items-center justify-center gap-2 rounded-md text-sm"><Plus size={18}/>{labels?.empty ?? (zh ? '添加图片或视频' : 'Add images or videos')}</button>}
  </div>;
}
