import { useEffect, useRef, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import type { BrollOptions, BrollAsset } from '@pireel/studio-engine/broll-task';
import type { CaptionTaskRecord } from './caption-task-store';
import { loadCaptionMedia } from './caption-task-store';
import { studioProviders } from '@pireel/studio-engine/providers';
import { durableFileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
function AssetThumb({ asset, scope }: { asset: BrollAsset; scope: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let alive = true; let value = ''; void loadCaptionMedia(scope, asset.sig, asset.name).then(file => { if (file && alive) { value = URL.createObjectURL(file); setUrl(value); } }).catch(() => {}); return () => { alive = false; if (value) URL.revokeObjectURL(value); }; }, [scope, asset.sig]);
  return url ? asset.kind === 'image' ? <img src={url} alt="" className="pointer-events-none h-full w-full object-cover" /> : <video src={url} preload="metadata" onLoadedMetadata={e => { if (e.currentTarget.duration > 0) e.currentTarget.currentTime = Math.min(.05, e.currentTarget.duration / 2); }} muted playsInline className="pointer-events-none h-full w-full object-cover" /> : <div className="bg-panel-2 h-full w-full" />;
}
interface UploadCard { id: string; file: File; url: string; status: 'queued' | 'preparing' | 'uploading' | 'done' | 'failed'; progress: number; error?: string }
export function BrollSettings({ task, value, disabled, locale, onChange, onBusy }: { task: CaptionTaskRecord; value: BrollOptions; disabled: boolean; locale: 'zh' | 'en'; onChange: (value: BrollOptions) => void; onBusy: (busy: boolean) => void }) {
  const zh = locale === 'zh'; const input = useRef<HTMLInputElement>(null); const lock = useRef(false);
  const alive = useRef(true); const ownedUrls = useRef(new Set<string>());
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [uploads, setUploads] = useState<UploadCard[]>([]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; for (const url of ownedUrls.current) URL.revokeObjectURL(url); ownedUrls.current.clear(); }; }, []);
  const patchUpload = (id: string, patch: Partial<UploadCard>) => { if (alive.current) setUploads(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); };
  const runUploads = async (entries: UploadCard[]) => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusy(true); setError('');
    const assets = [...value.assets];
    try {
      for (const entry of entries) {
        if (!alive.current) break;
        const { file, id } = entry;
        patchUpload(id, { status: 'preparing', progress: 0, error: undefined });
        try {
          if (!/^(image|video)\//.test(file.type) || file.size > 1024 ** 3) throw new Error(zh ? '请选择 1GB 以下的图片或视频。' : 'Choose images or videos under 1GB.');
          const kind = file.type.startsWith('image/') ? 'image' : 'video';
          let dimensions;
          if (kind === 'image') { const bitmap = await createImageBitmap(file); dimensions = { width: bitmap.width, height: bitmap.height, durationSec: 5 }; bitmap.close(); }
          else dimensions = await probeVideoFile(file);
          if (!(dimensions.width > 0 && dimensions.height > 0 && dimensions.durationSec > 0) || dimensions.durationSec > 1800) throw new Error(zh ? '无法读取素材，或视频超过 30 分钟。' : 'Invalid media or video exceeds 30 minutes.');
          const sig = await durableFileSig(file);
          if (!alive.current) break;
          if (assets.some(a => a.sig === sig)) { setUploads(rows => rows.filter(row => row.id !== id)); URL.revokeObjectURL(entry.url); ownedUrls.current.delete(entry.url); continue; }
          const cached = await saveLocalVideo(file, sig);
          if (studioProviders().sceneProjects) {
            if (await studioProviders().sceneProjects!.owner() !== task.scope) throw new Error('登录账号已变化。');
            if (!alive.current) break;
            patchUpload(id, { status: 'uploading' });
            if (!await studioProviders().vault.backup(file, sig, { onProgress: n => patchUpload(id, { progress: Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0)) }) })) throw new Error('素材上传失败，请重试。');
          } else if (!cached) throw new Error('本机空间不足。');
          if (!alive.current) break;
          assets.push({ id, sig, name: file.name, kind, ...dimensions });
          onChange({ ...value, assets: [...assets], disabledPlacements: undefined, replacements: undefined, edits: undefined });
          patchUpload(id, { status: 'done', progress: 1 });
        } catch (e) { patchUpload(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) }); }
      }
    } finally { lock.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  };
  const cards: { id: string; name: string; asset?: BrollAsset; upload?: UploadCard }[] = [
    ...value.assets.filter(asset => !uploads.some(row => row.id === asset.id)).map(asset => ({ id: asset.id, name: asset.name, asset })),
    ...uploads.map(upload => ({ id: upload.id, name: upload.file.name, upload, asset: value.assets.find(asset => asset.id === upload.id) })),
  ];
  const upload = (files: File[]) => {
    if (lock.current || disabled || !files.length) return;
    if (cards.length + files.length > 20) { setError(zh ? '最多添加 20 个素材。' : 'Add up to 20 assets.'); return; }
    const entries: UploadCard[] = files.map(file => { const url = URL.createObjectURL(file); ownedUrls.current.add(url); return { id: crypto.randomUUID(), file, url, status: 'queued', progress: 0 }; });
    setUploads(rows => [...rows, ...entries]);
    void runUploads(entries);
  };
  const remove = (id: string) => {
    const entry = uploads.find(row => row.id === id);
    if (entry) { URL.revokeObjectURL(entry.url); ownedUrls.current.delete(entry.url); }
    setUploads(rows => rows.filter(row => row.id !== id));
    if (value.assets.some(a => a.id === id)) onChange({ ...value, assets: value.assets.filter(a => a.id !== id), manualClips: value.manualClips?.filter(p => p.assetId !== id), disabledPlacements: undefined, replacements: undefined, edits: undefined });
  };
  return <div className="mb-6 space-y-3">
    <input ref={input} type="file" multiple accept="video/*,image/*" className="hidden" aria-label={zh ? '添加配画面素材' : 'Add B-roll media'} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; upload(files); }} />
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(Array.from(e.dataTransfer.files)); }}>
        <div className="mb-3 flex items-center justify-between gap-3 text-sm"><span className="text-ink">{zh?'我的素材':'My footage'}</span><button type="button" disabled={disabled||busy} onClick={()=>input.current?.click()} className="text-ink-3 inline-flex items-center gap-1 text-xs"><Plus size={14}/>{zh?'上传素材':'Upload footage'}</button></div>
        <div role="region" aria-label={zh ? '素材列表' : 'Footage cards'} className="grid gap-x-1.5 gap-y-3 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(88px, 100%), 1fr))' }}>
        {cards.map(card => {
          const pending = card.upload && card.upload.status !== 'done' ? card.upload : undefined;
          return <div key={card.id} className="group relative min-w-0" data-upload-status={card.upload?.status ?? 'done'}>
            <div className="bg-panel relative aspect-[1.15] overflow-hidden rounded-lg">
              {card.upload ? card.upload.file.type.startsWith('image/') ? <img draggable={false} src={card.upload.url} alt="" className="pointer-events-none h-full w-full object-cover" /> : <video src={card.upload.url} preload="metadata" onLoadedMetadata={e => { if (e.currentTarget.duration > 0) e.currentTarget.currentTime = Math.min(.05, e.currentTarget.duration / 2); }} muted playsInline className="pointer-events-none h-full w-full object-cover" /> : card.asset && <AssetThumb asset={card.asset} scope={task.scope} />}
              {pending && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 px-1 text-center text-[10px] text-white" role="status" aria-label={`${card.name} ${zh ? '上传状态' : 'upload status'}`}>
                {pending.status === 'failed' ? <button type="button" disabled={busy || disabled} title={pending.error} onClick={() => void runUploads([pending])} className="rounded bg-black/50 px-2 py-1">{zh ? '重试' : 'Retry'}</button> : <><Loader2 size={14} className={pending.status === 'queued' ? 'opacity-60' : 'animate-spin'} /><span>{pending.status === 'queued' ? (zh ? '等待上传' : 'Queued') : pending.status === 'preparing' ? (zh ? '准备中' : 'Preparing') : `${Math.floor(pending.progress * 100)}%`}</span></>}
                <progress aria-label={`${card.name} ${zh ? '上传进度' : 'upload progress'}`} max={1} value={pending.status === 'uploading' || pending.status === 'failed' ? pending.progress : undefined} className="absolute inset-x-0 bottom-0 h-1 w-full accent-white" />
              </div>}
            </div>
            <span className="text-ink-3 mt-2 block truncate text-xs" title={card.upload?.error ?? card.name}>{card.name}</span>
            {!busy && <button type="button" disabled={disabled} aria-label={`${zh ? '移除' : 'Remove'} ${card.name}`} onClick={() => remove(card.id)} className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white"><X size={12} /></button>}
          </div>;
        })}
        </div>
        {!cards.length && <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()} className="bg-panel-2 text-ink-3 flex min-h-28 w-full items-center justify-center gap-2 rounded-md text-sm"><Plus size={18} />{zh ? '添加图片或视频' : 'Add images or videos'}</button>}
    </div>
    {error && <p role="alert" className="text-ink text-xs">{error}</p>}
    <label className="text-ink flex items-center gap-3 pt-3 text-sm"><input type="checkbox" disabled={disabled || busy} checked={value.captions} onChange={e => onChange({ ...value, captions: e.target.checked })} />{zh ? '字幕' : 'Captions'}</label>
  </div>;
}
