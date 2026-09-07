import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, Loader2, Upload, X, Sparkles } from 'lucide-react';
import { CAPTION_TASK_PRESETS, captionTaskCanvas, captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { CanvasCaptionPreview } from './canvas-caption-preview';
import { createCaptionAgentRemix } from './caption-agent-remix';
import { CaptionTaskCustomize } from './caption-task-customize';
import { studioProviders } from '@pireel/studio-engine/providers';
import { fileSig, probeVideoFile, type ProbedFile } from './media';
import { loadCurrentUser } from './current-user';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { ensureFontStylesheet } from './web-fonts';
import { loadCaptionTask, loadCaptionTaskResult, saveCaptionTask, type CaptionTaskRecord, type CaptionTaskStage } from './caption-task-store';

const defaults: CaptionTaskOptions = { presetId: 'clean', aspect: 'original', shortenPauses: false };
const stages: CaptionTaskStage[] = ['transcribing', 'cleaning', 'styling', 'rendering'];
const stageNames: Record<CaptionTaskStage, [string, string]> = {
  ready: ['准备就绪', 'Ready'], transcribing: ['识别讲话', 'Transcribing speech'], cleaning: ['整理长停顿', 'Shortening pauses'],
  styling: ['添加字幕', 'Styling captions'], rendering: ['生成视频', 'Rendering video'], completed: ['字幕视频已完成', 'Your captioned video is ready'],
  failed: ['处理未完成', 'Processing stopped'], interrupted: ['处理已中断', 'Processing interrupted'],
};
const actionClass = 'bg-ink text-bg inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

export function CaptionTaskPage({ taskId, locale, onBack, onOpenEditor }: { taskId: string; locale: 'zh' | 'en'; onBack: () => void; onOpenEditor: (projectId: string) => void }) {
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [scope, setScope] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<ProbedFile | null>(null);
  const [options, setOptions] = useState<CaptionTaskOptions>(defaults);
  const [task, setTask] = useState<CaptionTaskRecord | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [error, setError] = useState('');
  const [storageNote, setStorageNote] = useState('');
  const [original, setOriginal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const taskRef = useRef(task);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const remixingRef = useRef(false);
  const importGeneration = useRef(0);
  taskRef.current = task;

  useEffect(() => {
    alive.current = true;
    loadCurrentUser().then(async (user) => {
      if (!alive.current) return;
      if (!user || user.auth_method === 'anon') { setError(zh ? '请先登录，再处理字幕。' : 'Sign in to add captions.'); setLoadingProject(false); return; }
      setScope(user.user_id);

    }).catch(() => { if (alive.current) { setError(zh ? '无法读取登录状态，请刷新重试。' : 'Could not load your session. Refresh and try again.'); setLoadingProject(false); } });
    const preventLeave = (event: BeforeUnloadEvent) => { if (busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLeave);
    return () => { alive.current = false; abortRef.current?.abort(); window.removeEventListener('beforeunload', preventLeave); };
  }, [zh]);
  useEffect(() => { if (!file) { setSourceUrl(''); return; } const url = URL.createObjectURL(file); setSourceUrl(url); return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => { if (!result) { setResultUrl(''); return; } const url = URL.createObjectURL(result); setResultUrl(url); return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => { for (const preset of CAPTION_TASK_PRESETS) if (preset.style.font) void ensureFontStylesheet(preset.style.font); }, []);

  useEffect(() => { if (options.custom?.font) void ensureFontStylesheet(options.custom.font); }, [options.custom?.font]);

  const pickFile = async (next: File) => {
    if (busyRef.current) return;
    const generation = ++importGeneration.current;
    setPreparing(true); setError('');
    try {
      const metadata = await probeVideoFile(next);
      if (!alive.current || generation !== importGeneration.current) return;
      if (!Number.isFinite(metadata.durationSec) || metadata.durationSec <= 0 || !Number.isFinite(metadata.width) || metadata.width <= 0 || !Number.isFinite(metadata.height) || metadata.height <= 0) throw new Error(say('无法读取这个视频，请尝试其他文件。', 'Could not read this video. Try another file.'));
      if (!metadata.hasAudio) throw new Error(say('这个视频没有音轨，请选择有讲话内容的视频。', 'This video has no audio track. Choose a video with speech.'));
      if (taskRef.current && fileSig(next) !== taskRef.current.sourceSig) throw new Error(say('请选择这个字幕项目的原视频。其他视频请从首页新建。', 'Select this caption project’s original video. Start a new project for another video.'));
      setFile(next); setProbe(metadata); setOriginal(false);
    } catch (reason) { if (alive.current && generation === importGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && generation === importGeneration.current) setPreparing(false); }
  };
  const persist = async (next: CaptionTaskRecord, video?: Blob) => {
    taskRef.current = next;
    if (alive.current) setTask(next);
    try { await saveCaptionTask(next, video); }
    catch { if (alive.current) setStorageNote(say('本机存储空间不足。处理完成后请直接下载，关闭页面可能丢失结果。', 'Local storage is unavailable. Download the result before closing this page.')); }
  };
  const start = async (resume = false) => {
    if (!file || !probe || !scope || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setStopping(false); setFraction(0); setOriginal(false);
    const controller = new AbortController(); abortRef.current = controller;
    const next: CaptionTaskRecord = resume && taskRef.current ? { ...taskRef.current, stage: 'ready', error: undefined } : {
      ...taskRef.current, id: taskId, scope, name: taskRef.current?.name ?? file.name, sourceSig: taskRef.current?.sourceSig ?? fileSig(file), ...probe, options: { ...options, aspect: 'original' }, document: undefined, stage: 'ready', updatedAt: Date.now(),
    };
    try {
      await persist(next);
      if (!(await saveLocalVideo(file, next.sourceSig))) setStorageNote(say('原视频未缓存到本机；关闭页面后继续处理需要重新选择文件。', 'The source could not be cached. Re-select it to resume after closing this page.'));
      const { runCaptionTask } = await import('./caption-task-runner');
      const completed = await runCaptionTask(next, file, { signal: controller.signal, checkpoint: persist, progress: (value) => { if (alive.current) setFraction(value); } });
      if (!alive.current || controller.signal.aborted) return;
      setResult(completed.video);
      await persist(completed.task, completed.video);

    } catch (reason) {
      const message = controller.signal.aborted ? say('已停止。重新打开任务可以继续处理。', 'Stopped. You can resume this task.') : reason instanceof Error ? reason.message : String(reason);
      const readable = message === 'Failed to fetch' ? say('连接失败，请检查网络后重试。已完成的步骤会保留。', 'Connection failed. Check your network and retry. Completed steps are kept.') : message;
      await persist({ ...(taskRef.current ?? next), stage: controller.signal.aborted ? 'interrupted' : 'failed', error: readable, updatedAt: Date.now() });
      if (alive.current) setError(readable);

    } finally { busyRef.current = false; if (alive.current) { setBusy(false); setStopping(false); } abortRef.current = null; }
  };
  useEffect(() => {
    if (!scope) return;
    let current = true;
    setLoadingProject(true);
    (async () => {
      const record = await loadCaptionTask(scope, taskId);
      if (!record) throw new Error(say('找不到这个字幕项目，请返回首页重新添加视频。', 'This caption project is unavailable. Add a video from the home page.'));
      const [source, video] = await Promise.all([loadLocalVideo(record.sourceSig), loadCaptionTaskResult(scope, record.id)]);
      if (!current) return;
      setTask(record); setOptions(record.options); setFile(source); setProbe({ width: record.width, height: record.height, durationSec: record.durationSec, hasAudio: true }); setResult(video ?? null); setOriginal(false);
      if (!source) setError(say('请重新选择原视频以继续配置；已有成片仍可下载。', 'Re-select the original video to continue. An existing result can still be downloaded.'));
    })().catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoadingProject(false); });
    return () => { current = false; };
  }, [scope, taskId]);
  useEffect(() => {
    if (loadingProject || busy || !scope || task?.stage !== 'ready') return;
    const timer = setTimeout(() => {
      const current = taskRef.current;
      if (!current || current.stage !== 'ready' || busyRef.current) return;
      void persist({ ...current, options, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(timer);
  }, [options, loadingProject, busy, scope, task?.id, task?.stage]);
  const editInStudio = async () => {
    if (!task || !file || busyRef.current || remixingRef.current) return;
    remixingRef.current = true; setPreparing(true); setError('');
    try {
      const id = await createCaptionAgentRemix({ ...task, options }, file);
      if (alive.current) onOpenEditor(id);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { remixingRef.current = false; if (alive.current) setPreparing(false); }
  };
  const previewStyle = captionTaskStyle(options);
  const dimensions = captionTaskCanvas(task?.options.aspect ?? 'original', probe ?? { width: 9, height: 16 });
  const completed = task?.stage === 'completed' && !!resultUrl;
  const taskMode = !!task && !['ready'].includes(task.stage);
  const disabled = busy || preparing;
  const usePreset = (id: string) => { setOptions((current) => ({ ...current, presetId: id, custom: undefined })); };

  if (loadingProject) return <section className="studio-scope p-10" role="status">{error || say('正在打开字幕项目…', 'Opening caption project…')}</section>;
  if (!task) return <section className="studio-scope p-10"><p role="alert">{error}</p><button type="button" onClick={onBack} className={actionClass + ' mt-5'}>{say('返回首页', 'Back to home')}</button></section>;

  return <section className="studio-scope mx-auto w-full max-w-[1200px] px-5 py-8 sm:px-10">
    <button type="button" disabled={busy} onClick={onBack} className="text-ink-3 mb-6 inline-flex items-center gap-2 text-sm disabled:opacity-40"><ArrowLeft size={15} />{say('返回首页', 'Back to home')}</button>
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-ink text-3xl font-semibold tracking-tight">AI Captions</h1><p className="text-ink-3 mt-2 truncate text-sm">{task.name}</p></div><button type="button" disabled={!file || disabled} onClick={() => void editInStudio()} className="border-line text-ink inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium disabled:opacity-40"><Sparkles size={14} />Agent Remix</button></header>
    <input ref={inputRef} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void pickFile(next); }} />
    <div className="grid items-start gap-6 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="min-w-0 md:max-h-[calc(100dvh-190px)] md:overflow-y-auto md:pr-2" aria-label={taskMode ? say('字幕任务', 'Caption task') : say('字幕设置', 'Caption settings')}>
        {taskMode ? <div className="border-line bg-panel rounded-xl border p-6">
          <h2 className="text-ink flex items-center gap-2 text-xl font-semibold">{completed ? <Check size={20} /> : busy ? <Loader2 className="animate-spin" size={20} /> : null}{stageNames[task.stage][zh ? 0 : 1]}</h2>
          <div className="my-6 space-y-4">{stages.filter((stage) => stage !== 'cleaning' || task.options.shortenPauses).map((stage) => <div key={stage} className={'flex items-center gap-3 text-sm ' + (stage === task.stage || completed ? 'text-ink' : 'text-ink-3')}><span className={'size-2 rounded-full ' + (completed || stages.indexOf(stage) < stages.indexOf(task.stage) ? 'bg-accent' : 'bg-ink-4')} />{stageNames[stage][zh ? 0 : 1]}{stage === 'rendering' && task.stage === stage && <span className="ml-auto font-mono text-xs">{Math.round(fraction * 100)}%</span>}</div>)}</div>
          {busy && <><progress aria-label={say('视频生成进度', 'Video rendering progress')} value={task.stage === 'rendering' ? fraction : undefined} max={1} className="h-1.5 w-full accent-[var(--color-accent)]" /><p className="text-ink-3 mt-3 text-xs leading-relaxed">{say('处理期间请保持页面打开。', 'Keep this page open while processing.')}</p><button type="button" disabled={stopping} onClick={() => { abortRef.current?.abort(); setStopping(true); }} className="text-ink-3 mt-5 inline-flex items-center gap-2 text-xs"><X size={13} />{stopping ? say('正在停止…', 'Stopping…') : say('停止处理', 'Stop processing')}</button></>}
          {completed && <div className="space-y-3"><a href={resultUrl} download={task.name.replace(/\.[^.]+$/, '') + '-captions.mp4'} className={actionClass + ' w-full'}><Download size={16} />{say('下载视频', 'Download video')}</a><button type="button" disabled={!file || preparing} onClick={() => { void persist({ ...task, stage: 'ready', document: undefined, error: undefined }); setResult(null); }} className="text-ink-3 w-full py-1 text-xs underline">{say('调整样式再生成', 'Try another style')}</button><p className="text-ink-4 text-xs leading-relaxed">{say('结果保存在此浏览器，建议下载留存。', 'Results are saved in this browser. Download a copy to keep.')}</p></div>}
          {!busy && !completed && <button type="button" disabled={!file || preparing} onClick={() => void start(true)} className={actionClass + ' w-full'}>{say('继续处理', 'Resume processing')}</button>}
          {!busy && <button type="button" onClick={onBack} className="text-ink-3 mt-4 text-xs underline">{say('处理另一个视频', 'Start another video')}</button>}
        </div> : <>
          <h2 className="text-ink mb-4 text-sm font-medium">{say('选一个字幕样式', 'Choose a caption style')}</h2>
          <div role="region" aria-label={say('滚动浏览字幕样式', 'Scroll caption styles')} tabIndex={0} className="max-h-[260px] overflow-y-auto overscroll-contain pr-2 [scrollbar-width:thin] focus-visible:outline-accent">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-2 gap-y-3" role="group" aria-label={say('字幕预设', 'Caption presets')}>{CAPTION_TASK_PRESETS.filter((item) => item.id !== 'keywords' || !!studioProviders().captionEmphasis).map((item) => <button type="button" key={item.id} disabled={disabled} aria-pressed={options.presetId === item.id} onClick={() => usePreset(item.id)} className="group min-w-0 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              <span className={'bg-panel block aspect-[1.15] overflow-hidden rounded-lg border-2 ' + (options.presetId === item.id ? 'border-ink' : 'border-transparent group-hover:border-ink-4')}><CanvasCaptionPreview style={options.presetId === item.id ? previewStyle : item.style} locale={locale} tile /></span><span className="text-ink-3 mt-2 block truncate text-xs">{item.name[locale]}</span>
            </button>)}</div>
          </div>
          <CaptionTaskCustomize options={options} locale={locale} disabled={disabled} onChange={(patch) => setOptions((current) => ({ ...current, custom: { ...current.custom, ...patch } }))} onReset={() => setOptions((current) => ({ ...current, custom: undefined }))} />
          <div className="border-line mt-6 space-y-5 border-t pt-5"><label className="text-ink flex cursor-pointer items-start gap-3"><input type="checkbox" checked={options.shortenPauses} disabled={disabled} onChange={(event) => setOptions((current) => ({ ...current, shortenPauses: event.target.checked }))} className="mt-1 size-4 accent-[var(--color-accent)]" /><span className="text-sm">{say('AI 去停顿', 'Shorten pauses')}<span className="text-ink-3 mt-1 block text-xs">{say('缩短长停顿，保留自然语气。', 'Trim long pauses while keeping speech natural.')}</span></span></label></div>
          <button type="button" disabled={!file || !scope || disabled} onClick={() => void start()} className={actionClass + ' mt-7 w-full'}>{preparing ? <Loader2 size={16} className="animate-spin" /> : null}{preparing ? say('准备视频…', 'Preparing video…') : say('一键生成字幕视频', 'Add captions in one click')}</button><p className="text-ink-4 mt-3 text-center text-xs">{say('语音识别和重点词选择可能消耗积分。', 'Transcription and key phrase selection may use credits.')}</p>
        </>}
        {error && <p role="alert" className="text-ink mt-4 text-sm leading-relaxed">{error}</p>}{storageNote && <p role="status" className="text-ink-3 mt-3 text-xs leading-relaxed">{storageNote}</p>}
      </section>
      <section aria-label={say('视频预览', 'Video preview')} className="min-w-0 md:sticky md:top-6">
        <div className="bg-panel border-line flex min-h-[360px] items-center justify-center overflow-hidden rounded-xl border p-4" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const next = event.dataTransfer.files[0]; if (next) void pickFile(next); }}>
          {(sourceUrl || resultUrl) ? <div className="relative mx-auto w-full max-w-[380px] overflow-hidden rounded-lg bg-black" style={{ aspectRatio: dimensions.width / dimensions.height, width: Math.min(380, 490 * dimensions.width / dimensions.height), maxWidth: '100%' }}>
            <video key={completed && !original ? resultUrl : sourceUrl} src={completed && !original ? resultUrl : sourceUrl} controls playsInline className="h-full w-full object-cover" />
            {!taskMode && !original && <div className="pointer-events-none absolute inset-0" aria-hidden><CanvasCaptionPreview style={previewStyle} locale={locale} aspect={dimensions.width / dimensions.height} sampleText={say('字幕|预览', 'Caption|preview')} /></div>}
          </div> : <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="text-ink flex min-h-72 w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--color-line)] p-8 text-center"><Upload size={30} strokeWidth={1.5} /><span className="text-lg font-medium">{say('选择视频，或拖到这里', 'Choose a video or drop it here')}</span><span className="text-ink-3 text-xs">{say('无需打开编辑器', 'No editing workspace needed')}</span></button>}
        </div>
        <div className="text-ink-3 mt-3 flex items-center justify-between gap-3 text-xs"><span className="truncate">{task?.name ?? file?.name ?? say('支持有讲话内容的视频', 'Choose a video with speech')}</span>{sourceUrl && <button type="button" onClick={() => setOriginal((value) => !value)} aria-pressed={original} className="shrink-0 underline underline-offset-4">{original ? say('查看效果', 'Show captions') : say('对比原视频', 'Show original')}</button>}</div>
      </section>
    </div>

  </section>;
}
