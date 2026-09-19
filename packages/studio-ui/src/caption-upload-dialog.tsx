import { BROLL_SHOWCASE } from './workflow-art';
import { DubbingLanguageShowcase } from './dubbing-language-showcase';
import { studioProviders } from '@pireel/studio-engine/providers';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { CaptionEffectShowcase } from './caption-effect-showcase';
import { loadCurrentUser } from './current-user';
import { fileSig, durableFileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
import { DEFAULT_DUBBING_OPTIONS, DUBBING_MAX_DURATION_SEC, DUBBING_MAX_VIDEO_BYTES } from '@pireel/studio-engine/dubbing-task';
import { saveCaptionTask, type CaptionUploadProgress } from './caption-task-store';
import { captureCaptionCover } from './caption-project-cover';

export function CaptionUploadDialog({ open, locale, scene = 'captions', onOpenChange, onContinue }: {
  open: boolean; locale: 'zh' | 'en'; scene?: 'captions' | 'dubbing' | 'broll'; onOpenChange: (open: boolean) => void; onContinue: (id: string) => void;
}) {
  const zh = locale === 'zh';
  const dubbing = scene === 'dubbing';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<CaptionUploadProgress>({ phase: 'preparing' });
  const input = useRef<HTMLInputElement>(null);
  const uploadButton = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const creating = useRef(false);
  const pendingProject = useRef<{ sig: string; id: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(''); setBusy(false);
    return () => { generation.current++; };
  }, [open]);
  const choose = async (file: File) => {
    if (creating.current) return;
    creating.current = true;
    const current = ++generation.current;
    setBusy(true); setError(''); setProgress({ phase: 'preparing' });
    const report = (value: CaptionUploadProgress) => {
      if (current !== generation.current) return;
      const fraction = value.fraction !== undefined && Number.isFinite(value.fraction) ? Math.max(0, Math.min(1, value.fraction)) : undefined;
      setProgress({ ...value, fraction });
    };
    try {
      const [data, user] = await Promise.all([probeVideoFile(file), loadCurrentUser()]);
      if (current !== generation.current) return;
      if (!user || user.auth_method === 'anon') throw new Error(say('请先登录。', 'Please sign in.'));
      if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error(say('无法读取视频，请换一个文件。', 'Could not read this video. Choose another file.'));
      if (!data.hasAudio) throw new Error(say('请选择有声音的视频。', 'Choose a video with audio.'));
      if ((dubbing || scene === 'broll') && (data.durationSec > DUBBING_MAX_DURATION_SEC || file.size > DUBBING_MAX_VIDEO_BYTES)) throw new Error(say('请选择 30 分钟以内、1GB 以下的视频。', 'Choose a video up to 30 minutes and 1GB.'));
      const sig = studioProviders().sceneProjects ? await durableFileSig(file) : fileSig(file);
      if (!(await saveLocalVideo(file, sig)) && !studioProviders().sceneProjects) throw new Error(say('本机空间不足，请清理后重试。', 'Free some local storage and retry.'));
      if (current !== generation.current) return;
      const id = pendingProject.current?.sig === sig ? pendingProject.current.id : crypto.randomUUID();
      pendingProject.current = { sig, id };
      const coverThumb = await captureCaptionCover(file, data.durationSec).catch(() => undefined);
      if (current !== generation.current) return;
      await saveCaptionTask({ id, scene, scope: user.user_id, name: file.name, sourceSig: sig, ...data, coverThumb, options: { ...(dubbing ? { dubbing: DEFAULT_DUBBING_OPTIONS } : scene === 'broll' ? { broll: { assets: [], captions: true } } : {}), layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false }, stage: 'ready', updatedAt: Date.now() }, undefined, file, report);
      if (current === generation.current) { pendingProject.current = null; onOpenChange(false); onContinue(id); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { creating.current = false; if (current === generation.current) setBusy(false); }
  };
  const busyLabel = progress.phase === 'uploading' ? `${say('正在上传', 'Uploading')}${progress.fraction === undefined ? '…' : ` ${Math.floor(progress.fraction * 100)}%`}` : progress.phase === 'saving' ? say('正在保存…', 'Saving…') : say('正在准备…', 'Preparing…');
  return <Dialog open={open} onOpenChange={(value) => { if (!creating.current) onOpenChange(value); }}>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }} aria-describedby={undefined} className="studio-scope bg-bg border-line max-h-[90dvh] overflow-y-auto p-6 sm:max-w-[520px]" showCloseButton={!busy}>
      <DialogHeader className="text-left"><DialogTitle className="text-ink text-2xl font-semibold">{scene === 'broll' ? 'AI B-Roll' : dubbing ? 'Video Dubbing' : 'AI Captions'}</DialogTitle></DialogHeader>
      {open && (scene === 'broll' ? <div className="my-3 overflow-hidden rounded-lg"><img src={BROLL_SHOWCASE} alt={say('口播搭配咖啡豆、冲煮和成品镜头', 'A talking-head video paired with coffee beans, brewing and serving footage')} width={1536} height={1024} className="w-full object-contain" /></div> : dubbing ? <div className="my-7 flex flex-col items-center gap-4"><DubbingLanguageShowcase locale={locale} /></div> : <CaptionEffectShowcase locale={locale} suspended={busy} />)}
      <input ref={input} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file); }} />
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files[0]) void choose(event.dataTransfer.files[0]); }}>
        {dubbing && <p className="text-ink-3 mb-3 text-center text-xs">{say('支持 40+ 种语言', 'Supports 40+ languages')}</p>}
        <button ref={uploadButton} type="button" disabled={busy} onClick={() => input.current?.click()} className="bg-ink text-bg relative flex min-h-12 overflow-hidden w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:cursor-wait">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}{busy ? busyLabel : (dubbing || scene === 'broll') ? say('上传视频（30 分钟以内）', 'Upload video (up to 30 minutes)') : say('上传视频', 'Upload video')}
          {busy && <progress aria-label={say('视频上传进度', 'Video upload progress')} max={1} value={progress.phase === 'uploading' ? progress.fraction : undefined} className="absolute inset-x-0 bottom-0 h-1 w-full appearance-none accent-[var(--color-accent)] [&::-webkit-progress-bar]:bg-black/10 [&::-webkit-progress-value]:bg-[var(--color-accent)] [&::-moz-progress-bar]:bg-[var(--color-accent)]" />}
        </button>
      </div>
      {error && <p role="alert" className="text-ink text-sm">{error}</p>}
    </DialogContent>
  </Dialog>;
}
