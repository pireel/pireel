import { useRef, useState } from 'react';
import { Check, ImageIcon, Loader2 } from 'lucide-react';
import { studioLocale } from './i18n';
import type { ProjectCover } from './project-cover';

export function CoverApplyButton({ cover, appliedKey, onApply, disabled }: { cover: ProjectCover; appliedKey?: string; onApply: (cover: ProjectCover) => Promise<void>; disabled?: boolean }) {
  const zh = studioLocale().startsWith('zh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const applied = appliedKey === cover.key && !error;
  return <div>
    <button type="button" disabled={disabled || busy || applied} className="text-ink-2 hover:bg-line inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs disabled:opacity-50" onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try { await onApply(cover); }
      catch (reason) {
        const code = reason instanceof Error ? reason.message : '';
        const messages: Record<string, [string, string]> = {
          cover_output_changed: ['作品已切换，请在当前作品重新应用。', 'The output changed. Apply the cover to the current output.'],
          cover_image_unavailable: ['无法读取封面原图，请检查网络后重试。', 'Could not read the cover image. Check your connection and retry.'],
          cover_upload_failed: ['封面图片上传失败，请检查网络后重试。', 'The cover image could not be saved. Check your connection and retry.'],
          cover_sync_unavailable: ['作品尚未连接云端，请等待保存就绪后重试。', 'The project is not connected. Wait for saving to be ready and retry.'],
          cover_sync_failed: ['封面图片已上传，但作品同步尚未完成，请重试应用。', 'The image was uploaded, but the project has not synced. Retry applying it.'],
        };
        setError(messages[code]?.[zh ? 0 : 1] ?? (zh ? '封面未保存，请重试。' : 'The cover was not saved. Please retry.'));
      }
      finally { pending.current = false; setBusy(false); }
    }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : applied ? <Check size={13} /> : <ImageIcon size={13} />}
      {busy ? zh ? '正在应用…' : 'Applying…' : applied ? zh ? '已应用封面' : 'Cover applied' : error ? zh ? '重试应用封面' : 'Retry applying cover' : zh ? '应用为封面' : 'Apply as cover'}
    </button>
    {error && <p role="alert" className="text-destructive px-2 py-1 text-xs leading-relaxed">{error}</p>}
  </div>;
}

export function ChatCoverEntry({ cover, disabled, onGenerate }: { cover?: ProjectCover | null; disabled?: boolean; onGenerate: () => void }) {
  const zh = studioLocale().startsWith('zh');
  return <div className="mb-2 flex min-w-0 items-center gap-2">
    {cover && <button type="button" onClick={onGenerate} className="text-ink-3 flex min-w-0 items-center gap-1.5 text-xs"><img src={cover.url} alt={zh ? '当前封面' : 'Current cover'} className="h-7 w-7 rounded-sm object-contain" />{zh ? '当前封面' : 'Current cover'}</button>}
    <button type="button" disabled={disabled} onClick={onGenerate} className="text-ink-2 hover:bg-line ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs disabled:opacity-40"><ImageIcon size={13} />{zh ? '生成封面' : 'Generate cover'}</button>
  </div>;
}
