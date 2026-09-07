import { useEffect, useRef, useState } from 'react';
import { FileVideo, Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { CaptionExampleCards } from './caption-example-cards';
import { loadCurrentUser } from './current-user';
import { fileSig, probeVideoFile, type ProbedFile } from './media';
import { saveLocalVideo } from './local-media';
import { saveCaptionTask } from './caption-task-store';

export function CaptionUploadDialog({ open, locale, onOpenChange, onContinue }: {
  open: boolean; locale: 'zh' | 'en'; onOpenChange: (open: boolean) => void; onContinue: (id: string) => void;
}) {
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<ProbedFile | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const creating = useRef(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setFile(null); setMetadata(null); setScope(null); setError(''); setBusy(false);
    loadCurrentUser().then((user) => {
      if (!alive) return;
      if (user && user.auth_method !== 'anon') setScope(user.user_id);
      else setError(zh ? '请先登录，再添加视频。' : 'Sign in to add your video.');
    }).catch(() => { if (alive) setError(zh ? '无法读取登录状态，请稍后重试。' : 'Could not load your session. Try again.'); });
    return () => { alive = false; generation.current++; };
  }, [open, zh]);
  const choose = async (next: File) => {
    if (creating.current) return;
    const current = ++generation.current;
    setBusy(true); setError(''); setMetadata(null); setFile(null);
    try {
      const data = await probeVideoFile(next);
      if (current !== generation.current) return;
      if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error(say('无法读取视频，请尝试其他文件。', 'Could not read this video. Try another file.'));
      if (!data.hasAudio) throw new Error(say('这个视频没有音轨，请选择有讲话的视频。', 'Choose a video with spoken audio.'));
      setFile(next); setMetadata(data);
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (current === generation.current) setBusy(false); }
  };
  const next = async () => {
    if (!file || !metadata || !scope || busy || creating.current) return;
    creating.current = true; setBusy(true); setError('');
    const current = generation.current;
    try {
      const sig = fileSig(file);
      if (!(await saveLocalVideo(file, sig))) throw new Error(say('请释放本机存储空间后重试，视频还未进入处理。', 'Free some local storage and retry. Processing has not started.'));
      const id = crypto.randomUUID();
      await saveCaptionTask({ id, scope, name: file.name, sourceSig: sig, ...metadata, options: { presetId: 'clean', aspect: 'original', shortenPauses: false }, stage: 'ready', updatedAt: Date.now() });
      if (current === generation.current) { onOpenChange(false); onContinue(id); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { creating.current = false; if (current === generation.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!creating.current) onOpenChange(value); }}>
    <DialogContent className="studio-scope bg-bg border-line max-h-[90dvh] overflow-y-auto p-6 sm:max-w-[520px]" showCloseButton={!creating.current}>
      <DialogHeader className="text-left"><DialogTitle className="text-ink text-2xl font-semibold">AI Captions</DialogTitle><DialogDescription className="text-ink-3 text-sm">{say('先添加视频，下一步选择字幕样式。', 'Add your video, then choose your caption style.')}</DialogDescription></DialogHeader>
      <div className="my-3"><CaptionExampleCards locale={locale} compact /><p className="text-ink-4 mt-2 text-center text-xs">{say('字幕效果示例', 'Caption style examples')}</p></div>
      <input ref={input} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ''; if (selected) void choose(selected); }} />
      <div className="bg-panel rounded-lg p-4" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) void choose(event.dataTransfer.files[0]); }}>
        {file && metadata ? <div className="flex items-center gap-3"><FileVideo className="text-ink-3 shrink-0" size={25} /><div className="min-w-0 flex-1"><p className="text-ink truncate text-sm">{file.name}</p><p className="text-ink-3 mt-1 text-xs">{Math.floor(metadata.durationSec / 60)}:{String(Math.floor(metadata.durationSec % 60)).padStart(2, '0')}</p></div><button disabled={busy} type="button" onClick={() => input.current?.click()} className="text-ink-3 text-xs underline">{say('更换', 'Replace')}</button></div>
          : <button type="button" disabled={busy} onClick={() => input.current?.click()} className="border-line text-ink flex min-h-24 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed text-sm"><Upload size={23} />{busy ? say('读取视频…', 'Reading video…') : say('上传视频，或拖到这里', 'Upload a video or drop it here')}</button>}
      </div>
      {error && <p role="alert" className="text-ink text-sm">{error}</p>}
      <button type="button" disabled={!file || !metadata || !scope || busy} onClick={() => void next()} className="bg-ink text-bg flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy && <Loader2 size={15} className="animate-spin" />}{creating.current ? say('准备项目…', 'Preparing project…') : say('下一步：配置字幕', 'Next: configure captions')}</button>
    </DialogContent>
  </Dialog>;
}
