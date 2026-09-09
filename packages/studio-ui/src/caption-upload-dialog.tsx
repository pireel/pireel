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
import { DUBBING_ENTRY_ICON } from './workflow-art';
import { saveCaptionTask } from './caption-task-store';
import { captureCaptionCover } from './caption-project-cover';

export function CaptionUploadDialog({ open, locale, scene = 'captions', onOpenChange, onContinue }: {
  open: boolean; locale: 'zh' | 'en'; scene?: 'captions' | 'dubbing'; onOpenChange: (open: boolean) => void; onContinue: (id: string) => void;
}) {
  const zh = locale === 'zh';
  const dubbing = scene === 'dubbing';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    setBusy(true); setError('');
    try {
      const [data, user] = await Promise.all([probeVideoFile(file), loadCurrentUser()]);
      if (current !== generation.current) return;
      if (!user || user.auth_method === 'anon') throw new Error(say('请先登录。', 'Please sign in.'));
      if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error(say('无法读取视频，请换一个文件。', 'Could not read this video. Choose another file.'));
      if (!data.hasAudio) throw new Error(say('请选择有声音的视频。', 'Choose a video with audio.'));
      if (dubbing && (data.durationSec > DUBBING_MAX_DURATION_SEC || file.size > DUBBING_MAX_VIDEO_BYTES)) throw new Error(say('请选择 30 分钟以内、1GB 以下的视频。', 'Choose a video up to 30 minutes and 1GB.'));
      const sig = studioProviders().sceneProjects ? await durableFileSig(file) : fileSig(file);
      if (!(await saveLocalVideo(file, sig)) && !studioProviders().sceneProjects) throw new Error(say('本机空间不足，请清理后重试。', 'Free some local storage and retry.'));
      if (current !== generation.current) return;
      const id = pendingProject.current?.sig === sig ? pendingProject.current.id : crypto.randomUUID();
      pendingProject.current = { sig, id };
      const coverThumb = await captureCaptionCover(file, data.durationSec).catch(() => undefined);
      if (current !== generation.current) return;
      await saveCaptionTask({ id, scene, scope: user.user_id, name: file.name, sourceSig: sig, ...data, coverThumb, options: { ...(dubbing ? { dubbing: DEFAULT_DUBBING_OPTIONS } : {}), layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false }, stage: 'ready', updatedAt: Date.now() }, undefined, file);
      if (current === generation.current) { pendingProject.current = null; onOpenChange(false); onContinue(id); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { creating.current = false; if (current === generation.current) setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (!creating.current) onOpenChange(value); }}>
    <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }} aria-describedby={undefined} className="studio-scope bg-bg border-line max-h-[90dvh] overflow-y-auto p-6 sm:max-w-[520px]" showCloseButton={!busy}>
      <DialogHeader className="text-left"><DialogTitle className="text-ink text-2xl font-semibold">{dubbing ? 'Video Dubbing' : 'AI Captions'}</DialogTitle></DialogHeader>
      {open && (dubbing ? <div className="my-7 flex flex-col items-center gap-4"><img src={DUBBING_ENTRY_ICON} alt="" width={96} height={96} /><DubbingLanguageShowcase locale={locale} /><p className="text-ink-3 text-xs">{say('30 分钟以内的视频', 'Videos up to 30 minutes')}</p></div> : <CaptionEffectShowcase locale={locale} suspended={busy} />)}
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
