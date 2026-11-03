import { useRef, useState } from 'react';
import { Check, ImageIcon, Loader2 } from 'lucide-react';
import type { ProjectCover } from '@pireel/studio-ui/project-cover';
import { t } from './i18n';

export function CoverApplyButton({ cover, appliedKey, onApply, disabled }: { cover: ProjectCover; appliedKey?: string; onApply: (cover: ProjectCover) => Promise<void>; disabled?: boolean }) {
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
        const COVER_ERRORS = new Set(['cover_output_changed', 'cover_image_unavailable', 'cover_upload_failed', 'cover_sync_unavailable', 'cover_sync_failed']);
        setError(COVER_ERRORS.has(code) ? t(`ui.coverError.${code}`) : t('ui.chatCoverControls.coverWasNotSaved'));
      }
      finally { pending.current = false; setBusy(false); }
    }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : applied ? <Check size={13} /> : <ImageIcon size={13} />}
      {busy ? t('ui.chatCoverControls.applying') : applied ? t('ui.chatCoverControls.coverApplied') : error ? t('ui.chatCoverControls.retryApplyingCover') : t('ui.chatCoverControls.applyAsCover')}
    </button>
    {error && <p role="alert" className="text-destructive px-2 py-1 text-xs leading-relaxed">{error}</p>}
  </div>;
}
