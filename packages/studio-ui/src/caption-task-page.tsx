import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pireel/ui/select';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Upload, Sparkles } from 'lucide-react';
import { CAPTION_TASK_PRESETS, CAPTION_TRANSLATION_LANGUAGES, captionTaskGroupBottom, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { DEFAULT_DUBBING_OPTIONS, dubbingVoicesReady } from '@pireel/studio-engine/dubbing-task';
import { DubbingSettings } from './dubbing-settings';
import { CaptionPositionPreview } from './caption-position-preview';
import { CaptionPresetCarousel } from './caption-preset-carousel';
import { CaptionProgressOverlay } from './caption-progress-overlay';
import { createCaptionAgentRemix } from './caption-agent-remix';
import { CaptionTaskCustomize } from './caption-task-customize';
import { studioProviders } from '@pireel/studio-engine/providers';
import { fileSig, probeVideoFile, type ProbedFile } from './media';
import { loadCurrentUser } from './current-user';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { captureCaptionFirstFrame } from './caption-project-cover';
import { ensureFontStylesheet } from './web-fonts';
import { loadCaptionTask, saveCaptionTask, listCaptionVersions, loadCaptionVersion, type CaptionTaskRecord, type CaptionTaskProgress, type CaptionVersionSummary, type CaptionTaskVersion } from './caption-task-store';

const defaults: CaptionTaskOptions = { layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false };
const actionClass = 'bg-ink text-bg inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

export function CaptionTaskPage({ taskId, locale, scene = 'captions', onBack, onOpenEditor }: { taskId: string; locale: 'zh' | 'en'; scene?: 'captions' | 'dubbing'; onBack: () => void; onOpenEditor: (projectId: string) => void }) {
  const zh = locale === 'zh';
  const isDubbing = scene === 'dubbing';
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
  const [progress, setProgress] = useState<CaptionTaskProgress>({});
  const [result, setResult] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [cover, setCover] = useState('');
  const [firstFrame, setFirstFrame] = useState('');
  const [versions, setVersions] = useState<CaptionVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<CaptionTaskVersion | null>(null);
  const [drafting, setDrafting] = useState(true);
  const [versionLoading, setVersionLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageNote, setStorageNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const taskRef = useRef(task);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const remixingRef = useRef(false);
  const versionRequest = useRef(0);
  const importGeneration = useRef(0);
  const inMemoryVersions = useRef(new Map<string, { version: CaptionTaskVersion; video: Blob }>());
  taskRef.current = task;

  useEffect(() => {
    alive.current = true;
    loadCurrentUser().then((user) => {
      if (!alive.current) return;
      if (!user || user.auth_method === 'anon') { setError(say('请先登录，再处理字幕。', 'Sign in to add captions.')); setLoadingProject(false); return; }
      setScope(user.user_id);
    }).catch(() => { if (alive.current) { setError(say('无法读取登录状态，请刷新重试。', 'Could not load your session. Refresh and retry.')); setLoadingProject(false); } });
    const preventLeave = (event: BeforeUnloadEvent) => { if (busyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLeave);
    return () => { alive.current = false; versionRequest.current++; abortRef.current?.abort(); window.removeEventListener('beforeunload', preventLeave); };
  }, [zh]);
  useEffect(() => { if (!result) { setResultUrl(''); return; } const url = URL.createObjectURL(result); setResultUrl(url); return () => URL.revokeObjectURL(url); }, [result]);
  useEffect(() => { if (isDubbing) return; for (const preset of CAPTION_TASK_PRESETS) if (preset.style.font) void ensureFontStylesheet(preset.style.font); }, [isDubbing]);
  useEffect(() => { if (options.custom?.font) void ensureFontStylesheet(options.custom.font); }, [options.custom?.font]);
  useEffect(() => {
    setFirstFrame('');
    if (!file) return;
    let current = true;
    void captureCaptionFirstFrame(file).then((image) => { if (current && image) setFirstFrame(image); }).catch(() => {});
    return () => { current = false; };
  }, [file]);

  const pickFile = async (next: File) => {
    if (busyRef.current) return;
    const generation = ++importGeneration.current;
    setPreparing(true); setError('');
    try {
      const metadata = await probeVideoFile(next);
      if (!alive.current || generation !== importGeneration.current) return;
      if (![metadata.durationSec, metadata.width, metadata.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error(say('无法读取这个视频。', 'Could not read this video.'));
      if (!metadata.hasAudio) throw new Error(say('请选择有讲话内容的视频。', 'Choose a video with speech.'));
      if (taskRef.current && fileSig(next) !== taskRef.current.sourceSig) throw new Error(say('请选择这个字幕项目的原视频。', 'Select this caption project’s original video.'));
      setFile(next); setProbe(metadata);
    } catch (reason) { if (alive.current && generation === importGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && generation === importGeneration.current) setPreparing(false); }
  };
  const persist = async (next: CaptionTaskRecord, video?: Blob) => {
    taskRef.current = next;
    if (alive.current) setTask(next);
    try { await saveCaptionTask(next, video); return true; }
    catch { if (alive.current) setStorageNote(say('本机空间不足，当前结果请直接下载保存。', 'Local storage is unavailable. Download the current result to keep it.')); return false; }
  };
  const start = async (resume = false) => {
    if (!file || !probe || !scope || busyRef.current) return;
    busyRef.current = true; versionRequest.current++;
    setBusy(true); setVersionLoading(false); setError(''); setStopping(false); setProgress({ preparing: { status: 'running' } }); setDrafting(true);
    const controller = new AbortController(); abortRef.current = controller;
    const current = taskRef.current;
    const next: CaptionTaskRecord = resume && current ? { ...current, generationId: current.generationId ?? crypto.randomUUID(), draftOptions: undefined, stage: 'preparing', error: undefined } : {
      ...current, scene, ...(isDubbing ? { dubbing: { ...current?.dubbing, lipJobId: undefined, lipResultUrl: undefined, outputSig: undefined } } : {}), id: taskId, scope, name: current?.name ?? file.name, sourceSig: current?.sourceSig ?? fileSig(file), ...probe,
      generationId: crypto.randomUUID(), options: structuredClone({ ...options, aspect: 'original' }), draftOptions: undefined, document: undefined, progress: { preparing: { status: 'running' } }, stage: 'preparing', updatedAt: Date.now(),
    };
    if (resume) setOptions(next.options);
    try {
      await persist(next);
      if (!(await saveLocalVideo(file, next.sourceSig))) setStorageNote(say('原视频未缓存，重新打开时可能需要重新选择。', 'The source is not cached. You may need to re-select it after reopening.'));
      const runCaptionTask = isDubbing ? (await import('./dubbing-task-runner')).runDubbingTask : (await import('./caption-task-runner')).runCaptionTask;
      const completed = await runCaptionTask(next, file, { signal: controller.signal, checkpoint: async (record) => { await persist(record); }, progress: () => {}, stageProgress: (value) => { if (alive.current) setProgress(value); } });
      if (!alive.current || controller.signal.aborted) return;
      if (isDubbing && completed.task.dubbing?.outputCached === false) setStorageNote(say('成片未缓存到本机，请及时下载保存。', 'The result could not be cached locally. Download a copy.'));
      const saved = await persist(completed.task, completed.video);
      const history = saved ? await listCaptionVersions(scope, taskId) : versions;
      const summary = history.find((version) => version.id === next.generationId) ?? { id: next.generationId!, number: Math.max(0, ...history.map((version) => version.number)) + 1, createdAt: completed.task.updatedAt };
      const version = { ...summary, task: structuredClone(completed.task) };
      if (!saved) inMemoryVersions.current.set(version.id, { version, video: completed.video });
      if (!alive.current) return;
      setVersions(history.some((entry) => entry.id === summary.id) ? history : [summary, ...history]);
      setSelectedVersion(version); setResult(completed.video); setDrafting(false);
    } catch (reason) {
      const setupRequired = reason instanceof Error && 'code' in reason && reason.code === 'dubbing_setup_required';
      const message = controller.signal.aborted ? say('已停止，可继续本次处理。', 'Stopped. You can resume this run.') : reason instanceof Error ? reason.message : String(reason);
      const readable = message === 'Failed to fetch' ? say('连接失败，请检查网络后重试。', 'Connection failed. Check your network and retry.') : message;
      await persist({ ...(taskRef.current ?? next), stage: setupRequired ? 'ready' : controller.signal.aborted ? 'interrupted' : 'failed', error: setupRequired ? undefined : readable, updatedAt: Date.now() });
      if (alive.current) setError(readable);
    } finally { busyRef.current = false; if (alive.current) { setBusy(false); setStopping(false); } abortRef.current = null; }
  };
  useEffect(() => {
    if (!scope) return;
    let current = true;
    setLoadingProject(true); inMemoryVersions.current.clear();
    (async () => {
      const record = await loadCaptionTask(scope, taskId);
      if (!record) throw new Error(say('找不到这个项目。', 'This caption project is unavailable.'));
      if ((record.scene ?? 'captions') !== scene) throw new Error(say('项目类型不匹配，请从首页打开。', 'Open this project from the home page.'));
      const [source, history] = await Promise.all([loadLocalVideo(record.sourceSig), listCaptionVersions(scope, taskId)]);
      const selected = history[0] ? await loadCaptionVersion(scope, taskId, history[0].id) : undefined;
      if (!current) return;
      setTask(record); setOptions(history.length === 0 && record.stage === 'ready' ? { ...(record.draftOptions ?? record.options), layoutVersion: 2 } : record.draftOptions ?? record.options); setFile(source); setCover(record.coverThumb ?? '');
      setProbe({ width: record.width, height: record.height, durationSec: record.durationSec, hasAudio: true });
      setVersions(history); setSelectedVersion(selected?.version ?? null); setResult(selected?.video ?? null); setProgress(record.progress ?? {});
      setDrafting(!!record.draftOptions || !selected || record.stage !== 'completed');
      if (!source) setError(say('请重新选择原视频以继续配置；已有版本仍可下载。', 'Re-select the source to continue. Existing versions can still be downloaded.'));
      else if (record.error) setError(record.error);
    })().catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoadingProject(false); });
    return () => { current = false; versionRequest.current++; };
  }, [scope, taskId]);

  const changeOptions = (update: (current: CaptionTaskOptions) => CaptionTaskOptions, keepLayout = false) => {
    if (busyRef.current) return;
    versionRequest.current++; setVersionLoading(false); setDrafting(true); setOptions((current) => update(keepLayout ? current : { ...current, layoutVersion: 2 }));
  };
  useEffect(() => {
    if (loadingProject || busy || !scope || !drafting) return;
    const timer = setTimeout(() => {
      const current = taskRef.current;
      if (!current || busyRef.current || JSON.stringify(current.draftOptions ?? current.options) === JSON.stringify(options)) return;
      void persist({ ...current, draftOptions: options, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(timer);
  }, [options, loadingProject, busy, scope, drafting]);

  const selectVersion = async (id: string) => {
    if (!scope || busyRef.current) return;
    const request = ++versionRequest.current;
    if (id === 'draft') { setDrafting(true); setVersionLoading(false); setOptions(taskRef.current?.draftOptions ?? taskRef.current?.options ?? defaults); return; }
    setVersionLoading(true); setError('');
    try {
      const current = taskRef.current;
      if (drafting && current && JSON.stringify(current.draftOptions ?? current.options) !== JSON.stringify(options)) await persist({ ...current, draftOptions: options, updatedAt: Date.now() });
      const loaded = inMemoryVersions.current.get(id) ?? await loadCaptionVersion(scope, taskId, id);
      if (!alive.current || request !== versionRequest.current) return;
      if (!loaded) throw new Error(say('这个版本暂时无法读取。', 'This version could not be loaded.'));
      setSelectedVersion(loaded.version); setResult(loaded.video); setOptions(loaded.version.task.options); setDrafting(false);
    } catch (reason) { if (alive.current && request === versionRequest.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && request === versionRequest.current) setVersionLoading(false); }
  };
  const editInStudio = async () => {
    if (!task || !file || busyRef.current || remixingRef.current || versionLoading) return;
    remixingRef.current = true; setPreparing(true); setError('');
    try {
      const source = !drafting && selectedVersion ? selectedVersion.task : { ...task, options, document: undefined, ...(isDubbing ? { dubbing: { ...task.dubbing, outputSig: undefined } } : {}) };
      const id = await createCaptionAgentRemix(source, file);
      if (alive.current) onOpenEditor(id);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { remixingRef.current = false; if (alive.current) setPreparing(false); }
  };
  const ratio = probe && probe.width > 0 && probe.height > 0 ? probe.width / probe.height : 9 / 16;
  const playable = !drafting && !!resultUrl && !busy && !versionLoading;
  const disabled = busy || preparing || versionLoading;
  const resumable = drafting && task && ['failed', 'interrupted'].includes(task.stage) && !task.draftOptions && JSON.stringify(options) === JSON.stringify(task.options);

  if (loadingProject) return <section className="studio-scope p-10" role="status">{error || say('正在打开项目…', 'Opening project…')}</section>;
  if (!task) return <section className="studio-scope p-10"><p role="alert">{error}</p><button type="button" onClick={onBack} className={actionClass + ' mt-5'}>{say('返回首页', 'Back to home')}</button></section>;

  return <section className="studio-scope mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-10">
    <button type="button" disabled={busy} onClick={onBack} className="text-ink-3 mb-5 inline-flex items-center gap-2 text-sm disabled:opacity-40"><ArrowLeft size={15} />{say('返回首页', 'Back to home')}</button>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-ink text-2xl font-semibold tracking-tight">{isDubbing ? 'Video Dubbing' : 'AI Captions'}</h1><p className="text-ink-3 mt-2 truncate text-sm">{task.name}</p></div><button type="button" disabled={!file || disabled} onClick={() => void editInStudio()} className="border-line text-ink inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium disabled:opacity-40"><Sparkles size={14} />Agent Remix</button></header>
    <input ref={inputRef} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void pickFile(next); }} />
    <div className="grid items-start gap-7 md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="min-w-0 md:max-h-[calc(100dvh-180px)] md:overflow-y-auto md:pr-2" aria-label={isDubbing ? say('译制设置', 'Dubbing settings') : say('字幕设置', 'Caption settings')}>
        {isDubbing ? <DubbingSettings transcript={task.transcript} durationSec={task.durationSec} translatedTurns={task.dubbing?.language === options.dubbing?.language ? task.dubbing?.translatedTurns : undefined} value={options.dubbing ?? DEFAULT_DUBBING_OPTIONS} translatedText={task.dubbing?.language === options.dubbing?.language ? task.dubbing?.translatedText : undefined} locale={locale} disabled={disabled} onChange={(dubbing) => changeOptions((current) => ({ ...current, dubbing }))} /> : <>
        <CaptionPresetCarousel options={options} locale={locale} disabled={disabled} onSelect={(presetId) => changeOptions((current) => ({ ...current, presetId, custom: undefined }))} />
        {(!!studioProviders().translate || options.translationLanguage) && <div className="border-line mt-5 border-t pt-5">
          <div className="text-ink flex items-center justify-between gap-4 text-sm"><span>{say('双语字幕', 'Bilingual captions')}</span>
            <Select value={options.translationLanguage ?? 'off'} disabled={disabled} onValueChange={(value) => changeOptions((current) => ({ ...current, translationLanguage: CAPTION_TRANSLATION_LANGUAGES.find((language) => language.id === value)?.id }))}>
              <SelectTrigger aria-label={say('翻译语言', 'Translation language')} className="border-line bg-bg w-36 text-xs shadow-none hover:bg-panel-2"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="off">{say('关闭', 'Off')}</SelectItem>{CAPTION_TRANSLATION_LANGUAGES.map((language) => <SelectItem key={language.id} disabled={!studioProviders().translate} value={language.id}>{language.name[locale]}</SelectItem>)}</SelectContent>
            </Select>
          </div>{options.translationLanguage && <p className="text-ink-3 mt-2 text-xs">{say('原文在上，译文在下。', 'Original above, translation below.')}</p>}
        </div>}
        <CaptionTaskCustomize options={options} source={probe ?? undefined} locale={locale} disabled={disabled} onChange={(patch) => changeOptions((current) => ({ ...current, custom: { ...current.custom, ...patch } }))} onReset={() => changeOptions((current) => ({ ...current, layoutVersion: 2, custom: undefined }))} />
        <div className="border-line mt-5 border-t pt-5"><label className="text-ink flex cursor-pointer items-start gap-3"><input type="checkbox" checked={options.shortenPauses} disabled={disabled} onChange={(event) => changeOptions((current) => ({ ...current, shortenPauses: event.target.checked }))} className="mt-1 size-4 accent-[var(--color-accent)]" /><span className="text-sm">{say('AI 去停顿', 'Shorten pauses')}<span className="text-ink-3 mt-1 block text-xs">{say('缩短长停顿，保留自然语气。', 'Trim long pauses while keeping speech natural.')}</span></span></label></div>
        </>}
        <button type="button" disabled={!file || !scope || disabled || (isDubbing && (!options.dubbing || !dubbingVoicesReady(task.transcript ?? [], options.dubbing)))} onClick={() => void start()} className={actionClass + ' mt-6 w-full'}>{busy || preparing ? <Loader2 size={16} className="animate-spin" /> : null}{busy ? say('正在生成…', 'Generating…') : versions.length ? say('生成新版本', 'Generate new version') : isDubbing ? say('生成译制视频', 'Generate dubbed video') : say('生成字幕视频', 'Generate captioned video')}</button>
        {resumable && !busy && <button type="button" disabled={!file || disabled} onClick={() => void start(true)} className="text-ink-3 mt-3 w-full text-xs underline">{say('继续上次处理', 'Resume last run')}</button>}
        <p className="text-ink-4 mt-3 text-center text-xs">{isDubbing ? say('识别、翻译、配音和口型同步按实际使用计费。', 'Transcription, translation, speech and lip sync use credits.') : say('语音识别、翻译和重点词选择可能消耗积分。', 'Transcription, translation and key phrase selection may use credits.')}</p>
        {!file && <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="text-ink mt-4 flex items-center gap-2 text-sm"><Upload size={16} />{say('重新选择原视频', 'Re-select source video')}</button>}
        {error && <p role="alert" className="text-ink mt-4 text-sm leading-relaxed">{error}</p>}{storageNote && <p role="status" className="text-ink-3 mt-3 text-xs leading-relaxed">{storageNote}</p>}
      </section>
      <section aria-label={say('视频预览', 'Video preview')} className="min-w-0 md:sticky md:top-5">
        {versions.length > 0 && <div className="mb-3 flex items-center justify-between gap-3">
          <Select disabled={busy || versionLoading} value={drafting ? 'draft' : selectedVersion?.id ?? 'draft'} onValueChange={(value) => void selectVersion(value)}>
            <SelectTrigger aria-label={say('视频版本', 'Video version')} className="border-line bg-bg text-ink w-36 text-xs shadow-none hover:bg-panel-2"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="draft">{say('当前配置', 'Current settings')}</SelectItem>{versions.map((version) => <SelectItem key={version.id} value={version.id}>{say('版本', 'Version')} {version.number}</SelectItem>)}</SelectContent>
          </Select>
          {playable && selectedVersion && <a href={resultUrl} download={`${task.name.replace(/\.[^.]+$/, '')}-v${selectedVersion.number}.mp4`} className="text-ink inline-flex items-center gap-1.5 text-xs"><Download size={14} />{say('下载', 'Download')}</a>}
        </div>}
        <div className="relative mx-auto overflow-hidden rounded-lg bg-black" style={{ aspectRatio: ratio, width: `min(100%, calc((100dvh - ${versions.length ? 245 : 195}px) * ${ratio}))` }}>
          {playable ? <video key={resultUrl} src={resultUrl} controls playsInline className="h-full w-full object-contain" /> : <>
            {(firstFrame || cover) ? <img src={firstFrame || cover} alt={say('视频首帧', 'First video frame')} className="h-full w-full object-contain" /> : <div className="bg-panel h-full w-full" />}
            {!isDubbing && !busy && !versionLoading && <CaptionPositionPreview options={options} source={probe ?? { width: 1080, height: 1920 }} locale={locale} disabled={disabled} onChange={(yPct) => changeOptions((current) => {
              const custom = { ...current.custom };
              if (yPct === captionTaskGroupBottom({ ...current, custom: undefined }, probe ?? { width: 1080, height: 1920 })) delete custom.yPct;
              else custom.yPct = yPct;
              return { ...current, custom: Object.keys(custom).length ? custom : undefined };
            }, true)} />}
          </>}
          {versionLoading && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"><Loader2 size={24} className="animate-spin" /><span className="sr-only">{say('读取版本', 'Loading version')}</span></div>}
          {busy && <CaptionProgressOverlay options={task.options} progress={progress} locale={locale} stopping={stopping} onStop={() => { abortRef.current?.abort(); setStopping(true); }} />}
        </div>
      </section>
    </div>
  </section>;
}
