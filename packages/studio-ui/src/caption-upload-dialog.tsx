import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { CaptionEffectShowcase } from './caption-effect-showcase';
import { loadCurrentUser } from './current-user';
import { fileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
import { saveCaptionTask } from './caption-task-store';

export function CaptionUploadDialog({ open, locale, onOpenChange, onContinue }: {
  open: boolean; locale: 'zh' | 'en'; onOpenChange: (open: boolean) => void; onContinue: (id: string) => void;
}) {
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const creating = useRef(false);
  useEffect(() => {
    if (!open) return;
    setError(''); setBusy(false);
    return () => { generation.current++; };
  }, [open]);
  const choose = async (file: File) => {
    if (creating.current) return;
    creating.current = true;
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const [data, user] = await Promise.all([probeVideoFile(file), loadCurrentUser()]);
      if (current !== generation.current) return;
      if (!user || user.auth_method === 'anon') throw new Error(say('请先登录。', 'Please sign in.'));
      if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error(say('无法读取视频，请换一个文件。', 'Could not read this video. Choose another file.'));
      if (!data.hasAudio) throw new Error(say('请选择有声音的视频。', 'Choose a video with audio.'));
      const sig = fileSig(file);
      if (!(await saveLocalVideo(file, sig))) throw new Error(say('本机空间不足，请清理后重试。', 'Free some local storage and retry.'));
      if (current !== generation.current) return;
      const id = crypto.randomUUID();
      await saveCaptionTask({ id, scope: user.user_id, name: file.name, sourceSig: sig, ...data, options: { presetId: 'clean', aspect: 'original', shortenPauses: false }, stage: 'ready', updatedAt: Date.now() });
      if (current === generation.current) { onOpenChange(false); onContinue(id); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { creating.current = false; if (current === generation.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!creating.current) onOpenChange(value); }}>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }} aria-describedby={undefined} className="studio-scope bg-bg border-line max-h-[90dvh] overflow-y-auto p-6 sm:max-w-[520px]" showCloseButton={!busy}>
      <DialogHeader className="text-left"><DialogTitle className="text-ink text-2xl font-semibold">AI Captions</DialogTitle></DialogHeader>
      {open && <CaptionEffectShowcase locale={locale} suspended={busy} />}
      <input ref={input} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file); }} />
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) void choose(event.dataTransfer.files[0]); }}>
        <button ref={uploadButton} type="button" disabled={busy} onClick={() => input.current?.click()} className="bg-ink text-bg flex min-h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}{busy ? say('正在导入…', 'Importing…') : say('上传视频', 'Upload video')}
        </button>
      </div>
      {error && <p role="alert" className="text-ink text-sm">{error}</p>}
    </DialogContent>
  </Dialog>;
}
