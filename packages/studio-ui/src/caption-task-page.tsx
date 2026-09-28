import { DEFAULT_PIP_OPTIONS } from '@pireel/studio-engine/pip-layout';
import { UgcAdSettings } from './ugc-ad-settings';
import { DEFAULT_UGC_AD_OPTIONS, readyUgcAdOptions } from '@pireel/studio-engine/ugc-ad';
import { SubtitleRemovalSettings, SubtitleRegionOverlay } from './subtitle-removal-settings';
import { DEFAULT_SUBTITLE_REMOVAL, normalizeErasureOptions, erasureKind, type ErasureKind } from '@pireel/studio-engine/subtitle-removal';
import { SceneVideoPreview } from './scene-video-preview';
import { SfxTimeline } from './sfx-timeline';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { SfxSettings } from './sfx-settings';
import { DEFAULT_SFX_OPTIONS, normalizeSfxOptions } from '@pireel/studio-engine/sfx-task';
import { PipSettings, PipLayoutPreview } from './pip-settings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pireel/ui/select';
import { brollAssetsMatch } from '@pireel/studio-engine/broll-task';
import { AGENT_ENTRY_ICON } from './workflow-art';
import { BrollTimeline } from './broll-timeline';
import { sceneActionClass } from './scene-action-styles';
import { BrollSettings } from './broll-settings';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@pireel/ui/dialog';
import { SceneCreditPreview } from './scene-credit-preview';
import { SceneSelect, SceneCheckbox } from './scene-form-controls';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, Loader2, Upload, Sparkles } from 'lucide-react';
import { CAPTION_TASK_PRESETS, CAPTION_TRANSLATION_LANGUAGES, captionTaskGroupBottom, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { DEFAULT_DUBBING_OPTIONS, dubbingVoicesReady, dubbingSceneOptions } from '@pireel/studio-engine/dubbing-task';
import { DubbingSettings } from './dubbing-settings';
import { CaptionPositionPreview } from './caption-position-preview';
import { CaptionPresetCarousel } from './caption-preset-carousel';
import { SceneBrandPicker } from './scene-brand-picker';
import { CaptionProgressOverlay } from './caption-progress-overlay';
import { createCaptionAgentRemix } from './caption-agent-remix';
import { CaptionTaskCustomize } from './caption-task-customize';
import { studioProviders } from '@pireel/studio-engine/providers';
import { fileSig, probeVideoFile, type ProbedFile } from './media';
import { loadCurrentUser } from './current-user';
import { saveLocalVideo } from './local-media';
import { captureCaptionFirstFrame } from './caption-project-cover';
import { ensureFontStylesheet } from './web-fonts';
import { loadCaptionTask, saveCaptionTask, loadCaptionMedia, syncCaptionProject, listCaptionVersions, loadCaptionVersion, type CaptionTaskRecord, type CaptionTaskProgress, type CaptionVersionSummary, type CaptionTaskVersion } from './caption-task-store';

const defaults: CaptionTaskOptions = { layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false };
const actionClass = 'bg-ink text-bg inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

export function CaptionTaskPage({ taskId, locale, scene = 'captions', onBack, onOpenEditor }: { taskId: string; locale: 'zh' | 'en'; scene?: 'captions' | 'dubbing' | 'broll' | 'pip' | 'sfx' | 'subtitle-removal' | 'ugc-ad'; onBack: () => void; onOpenEditor: (projectId: string) => void }) {
  const zh = locale === 'zh';
  const isRemoval = scene === 'subtitle-removal';
  const [removalModes, setRemovalModes] = useState<Partial<Record<ErasureKind, boolean>> | null>(null);
  useEffect(() => {
    if (!isRemoval) return;
    const controller = new AbortController();
    void fetch('/api/studio/subtitle-removal?availability=1', { signal: controller.signal }).then(response => response.ok ? response.json() : Promise.reject()).then(body => { if (!controller.signal.aborted) setRemovalModes(body.modes ?? { subtitles: body.available === true }); }).catch(() => { if (!controller.signal.aborted) setRemovalModes({}); });
    return () => controller.abort();
  }, [isRemoval]);
  const isSfx = scene === 'sfx';
  const isUgc = scene === 'ugc-ad';
  const isPip = scene === 'pip';
  const isBroll = scene === 'broll' || isPip || isUgc;
  const FootageSettings = isPip ? PipSettings : BrollSettings;
  const isDubbing = scene === 'dubbing';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [scope, setScope] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<ProbedFile | null>(null);
  const [options, setOptions] = useState<CaptionTaskOptions>(defaults);
  const removalAvailable = removalModes === null ? null : removalModes[erasureKind(options.subtitleRemoval)] === true;
  const [task, setTask] = useState<CaptionTaskRecord | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
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
      if (!isRemoval && !metadata.hasAudio) throw new Error(say('请选择有讲话内容的视频。', 'Choose a video with speech.'));
      if (taskRef.current && fileSig(next) !== taskRef.current.sourceSig) throw new Error(say('请选择这个字幕项目的原视频。', 'Select this caption project’s original video.'));
      setFile(next); setProbe(metadata);
    } catch (reason) { if (alive.current && generation === importGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && generation === importGeneration.current) setPreparing(false); }
  };
  const persist = async (next: CaptionTaskRecord, video?: Blob) => {
    taskRef.current = next;
    if (alive.current) setTask(next);
    try { await saveCaptionTask(next, video); if (alive.current && studioProviders().sceneProjects) setStorageNote(''); return true; }
    catch (error) { if (alive.current) setStorageNote(studioProviders().sceneProjects ? (error instanceof Error ? error.message : say('云端同步未完成，改动已保留在本机。', 'Cloud sync failed. Your changes are saved on this device.')) : say('本机空间不足，当前结果请直接下载保存。', 'Local storage is unavailable. Download the current result to keep it.')); return false; }
  };
  const exportCurrentEdit = async () => {
    const current = taskRef.current;
    if (!current || !file || busyRef.current) return;
    busyRef.current = true; setExporting(true); setExportProgress(0); setError('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const { exportBrollEdit } = await import('./broll-export');
      const video = isUgc ? await (await import('./ugc-ad-task-runner')).exportUgcAdEdit((!drafting && selectedVersion ? selectedVersion.task : { ...current, document: current.draftDocument ?? current.document }), file, { signal: controller.signal, progress: fraction => { if (alive.current) setExportProgress(fraction); } }) : isSfx ? await (await import('./sfx-task-runner')).exportSfxEdit((!drafting && selectedVersion ? selectedVersion.task : { ...current, document: current.draftDocument ?? current.document }), file, { signal: controller.signal, progress: fraction => { if (alive.current) setExportProgress(fraction); } }) : await exportBrollEdit(current, structuredClone(options), file, { signal: controller.signal, onProgress: fraction => { if(alive.current)setExportProgress(fraction); } });
      if (!alive.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(video);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${current.name.replace(/\.[^.]+$/, '')}-edit.mp4`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch(reason) {
      if(alive.current && !controller.signal.aborted)setError(reason instanceof Error ? reason.message : String(reason));
    } finally { busyRef.current = false; abortRef.current = null; if(alive.current)setExporting(false); }
  };
  const start = async (resume = false, confirmed = false) => {
    if (!file || !probe || !scope || busyRef.current) return;
    if (isUgc) { try { readyUgcAdOptions(options.ugcAd); } catch (error) { setError(error instanceof Error ? error.message : String(error)); return; } }
    if (!resume && !confirmed && versions.length > 0) { setConfirmGenerate(true); return; }
    busyRef.current = true; versionRequest.current++;
    setBusy(true); setVersionLoading(false); setError(''); setStopping(false); setProgress({ preparing: { status: 'running' } }); setDrafting(true);
    const controller = new AbortController(); abortRef.current = controller;
    const current = taskRef.current;
    const next: CaptionTaskRecord = resume && current ? { ...current, generationId: current.generationId ?? crypto.randomUUID(), draftOptions: undefined, stage: 'preparing', error: undefined } : {
      ...current, scene, ...(isDubbing ? { dubbing: { ...current?.dubbing, lipJobId: undefined, lipResultUrl: undefined, outputSig: undefined } } : {}), id: taskId, scope, name: current?.name ?? file.name, sourceSig: current?.sourceSig ?? fileSig(file), ...probe,
      generationId: crypto.randomUUID(), options: structuredClone({ ...options, ...(isSfx ? { sfx: normalizeSfxOptions(options.sfx) } : {}), ...(isRemoval ? { subtitleRemoval: normalizeErasureOptions(options.subtitleRemoval) } : {}), aspect: isUgc ? options.aspect : 'original' }), draftOptions: undefined, draftDocument: undefined, document: undefined, progress: { preparing: { status: 'running' } }, stage: 'preparing', updatedAt: Date.now(),
    };
    if (isDubbing) next.options = { ...next.options, dubbing: dubbingSceneOptions(next.options.dubbing ?? DEFAULT_DUBBING_OPTIONS), translationLanguage: undefined };
    if (resume) setOptions(next.options);
    try {
      await persist(next);
      if (!(await saveLocalVideo(file, next.sourceSig))) setStorageNote(say('原视频未缓存，重新打开时可能需要重新选择。', 'The source is not cached. You may need to re-select it after reopening.'));
      const runCaptionTask = isUgc ? (await import('./ugc-ad-task-runner')).runUgcAdTask : isRemoval ? (await import('./subtitle-removal-runner')).runSubtitleRemovalTask : isSfx ? (await import('./sfx-task-runner')).runSfxTask : isBroll ? (await import('./broll-task-runner')).runBrollTask : isDubbing ? (await import('./dubbing-task-runner')).runDubbingTask : (await import('./caption-task-runner')).runCaptionTask;
      const completed = await runCaptionTask(next, file, { signal: controller.signal, checkpoint: async (record) => { if (!await persist(record)) throw new Error(say('执行进度未保存，已停止后续处理。', 'Could not save execution progress. Further processing stopped.')); }, progress: () => {}, stageProgress: (value) => { if (alive.current) setProgress(value); } });
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
      const waiting = reason instanceof Error && 'code' in reason && reason.code === 'workflow_waiting';
      const message = controller.signal.aborted ? say('已停止，可继续本次处理。', 'Stopped. You can resume this run.') : reason instanceof Error ? reason.message : String(reason);
      const readable = message === 'Failed to fetch' ? say('连接失败，请检查网络后重试。', 'Connection failed. Check your network and retry.') : message;
      await persist({ ...(taskRef.current ?? next), stage: setupRequired ? 'ready' : waiting ? 'waiting' : controller.signal.aborted ? 'interrupted' : 'failed', error: setupRequired ? undefined : readable, updatedAt: Date.now() });
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
      if (alive.current && (record.cloudPending || record.cloudError)) setStorageNote(record.cloudError ?? say('这个项目尚未同步到云端。', 'This project has not synced to the cloud yet.'));
      if ((record.scene ?? 'captions') !== scene) throw new Error(say('项目类型不匹配，请从首页打开。', 'Open this project from the home page.'));
      if (studioProviders().sceneProjects && record.cloudPending) void syncCaptionProject(scope, taskId).then(() => { if (current) setStorageNote(''); }).catch((error) => { if (current) setStorageNote(error instanceof Error ? error.message : say('云端同步未完成。', 'Cloud sync is incomplete.')); });
      const [source, history] = await Promise.all([loadCaptionMedia(scope, record.sourceSig, record.name), listCaptionVersions(scope, taskId)]);
      const selected = history[0] ? await loadCaptionVersion(scope, taskId, history[0].id) : undefined;
      if (!current) return;
      const loadedOptions = record.draftOptions ?? record.options;
      setTask(record); setOptions(isDubbing ? { ...loadedOptions, layoutVersion: 2, dubbing: dubbingSceneOptions(loadedOptions.dubbing ?? DEFAULT_DUBBING_OPTIONS), translationLanguage: undefined } : history.length === 0 && record.stage === 'ready' ? { ...loadedOptions, layoutVersion: 2 } : loadedOptions); setFile(source); setCover(record.coverThumb ?? '');
      setProbe({ width: record.width, height: record.height, durationSec: record.durationSec, hasAudio: true });
      setVersions(history); setSelectedVersion(selected?.version ?? null); setResult(selected?.video ?? null); setProgress(record.progress ?? {});
      setDrafting(!!record.draftDocument || !!record.draftOptions || !selected || record.stage !== 'completed');
      if (!source) setError(say('请重新选择原视频以继续配置；已有版本仍可下载。', 'Re-select the source to continue. Existing versions can still be downloaded.'));
      else if (record.error && !(isDubbing && record.options.dubbing?.lipSync && record.progress?.lipsync?.status === 'running')) setError(record.error);
      else setError('');
    })().catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoadingProject(false); });
    return () => { current = false; versionRequest.current++; };
  }, [scope, taskId]);

  const changeOptions = (update: (current: CaptionTaskOptions) => CaptionTaskOptions, keepLayout = false) => {
    if (busyRef.current) return;
    if (isBroll && !drafting && selectedVersion && taskRef.current) { const next = { ...taskRef.current, broll: selectedVersion.task.broll, transcript: selectedVersion.task.transcript }; taskRef.current = next; setTask(next); }
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
    if (id === 'draft') { setDrafting(true); setVersionLoading(false); const draft = taskRef.current?.draftOptions ?? taskRef.current?.options ?? defaults; setOptions(isDubbing ? { ...draft, dubbing: dubbingSceneOptions(draft.dubbing ?? DEFAULT_DUBBING_OPTIONS), translationLanguage: undefined } : draft); return; }
    setVersionLoading(true); setError('');
    try {
      const current = taskRef.current;
      if (drafting && current && JSON.stringify(current.draftOptions ?? current.options) !== JSON.stringify(options)) await persist({ ...current, draftOptions: options, updatedAt: Date.now() });
      const loaded = inMemoryVersions.current.get(id) ?? await loadCaptionVersion(scope, taskId, id);
      if (!alive.current || request !== versionRequest.current) return;
      if (!loaded) throw new Error(say('这个版本暂时无法读取。', 'This version could not be loaded.'));
      setSelectedVersion(loaded.version); setResult(loaded.video); setOptions(isDubbing ? { ...loaded.version.task.options, dubbing: dubbingSceneOptions(loaded.version.task.options.dubbing ?? DEFAULT_DUBBING_OPTIONS), translationLanguage: undefined } : loaded.version.task.options); setDrafting(false);
    } catch (reason) { if (alive.current && request === versionRequest.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current && request === versionRequest.current) setVersionLoading(false); }
  };
  const editInStudio = async () => {
    if (!task || !file || busyRef.current || remixingRef.current || versionLoading) return;
    remixingRef.current = true; setPreparing(true); setError('');
    try {
      const source = !drafting && selectedVersion ? selectedVersion.task : { ...task, options, document: isSfx ? task.draftDocument ?? task.document : undefined, ...(isDubbing ? { dubbing: { ...task.dubbing, outputSig: undefined } } : {}) };
      if (isPip && drafting && task.broll?.planKey) {
        const { pipRenderModel } = await import('./pip-render-model');
        source.document = pipRenderModel(task, options, '', new Map()).document;
      }
      const id = await createCaptionAgentRemix(source, file);
      if (alive.current) onOpenEditor(id);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { remixingRef.current = false; if (alive.current) setPreparing(false); }
  };
  const editSfxDocument = (document: EditorDocumentV2) => {
    if (busyRef.current || !taskRef.current) return;
    versionRequest.current++; setVersionLoading(false); setDrafting(true);
    void persist({ ...taskRef.current, draftDocument: document, draftOptions: options, updatedAt: Date.now() });
  };
  const sfxViewTask = !drafting && selectedVersion ? selectedVersion.task : task ? { ...task, document: task.draftDocument ?? task.document } : null;
  const brollViewTask = !drafting && selectedVersion ? selectedVersion.task : task;
  const playable = !drafting && !!resultUrl && !busy && !versionLoading;
  const disabled = busy || preparing || versionLoading || exporting;
  const retrySfx = isSfx && drafting && !!task && ['failed', 'interrupted'].includes(task.stage) && !!task.workflow?.steps.some(step => {
    const receipt = task.workflowData?.receipts[step.inputKey ?? ''];
    return task.workflow?.definition?.steps.find(definition => definition.id === step.id)?.capability !== 'sfx.generate' && step.status === 'failed' && receipt?.status === 'running' && receipt.runId === task.generationId;
  });
  const resumable = !retrySfx && drafting && task && (!isSfx || (!!task.options.sfx && 'density' in task.options.sfx)) && ['failed', 'interrupted', 'waiting'].includes(task.stage) && !task.draftOptions && JSON.stringify(options) === JSON.stringify(task.options);

  if (loadingProject) return <section className="studio-scope p-10" role="status">{error || say('正在打开项目…', 'Opening project…')}</section>;
  if (!task) return <section className="studio-scope p-10"><p role="alert">{error}</p><button type="button" onClick={onBack} className={actionClass + ' mt-5'}>{say('返回首页', 'Back to home')}</button></section>;

  const videoActions = (addFootage?:ReactNode) => <div className="flex shrink-0 flex-wrap items-center gap-1.5 py-0.5">

    {versions.length > 0 && (
          <Select disabled={disabled} value={drafting ? 'draft' : selectedVersion?.id ?? 'draft'} onValueChange={(value) => void selectVersion(value)}>
            <SelectTrigger aria-label={say('视频版本', 'Video version')} className={sceneActionClass + ' w-auto min-w-24 justify-between'}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72"><SelectItem value="draft">{say('当前配置', 'Current settings')}</SelectItem>{versions.map((version) => <SelectItem key={version.id} value={version.id}>{say('版本', 'Version')} {version.number}</SelectItem>)}</SelectContent>
          </Select>
    )}
    {addFootage}
    <div className="flex-1" />
    <button type="button" disabled={!file || disabled} onClick={() => void editInStudio()} className={sceneActionClass}><img src={AGENT_ENTRY_ICON} width={18} height={18} alt="" className="size-[18px] object-contain"/>Agent Remix</button>
    {playable && selectedVersion ? <a href={resultUrl} download={`${task.name.replace(/\.[^.]+$/, '')}-v${selectedVersion.number}.mp4`} className={sceneActionClass}><Download size={14}/>{say('下载','Download')}</a> : <button type="button" disabled={disabled || !versions.length || (isRemoval && drafting) || (isSfx && drafting && !task.draftDocument) || (isUgc && drafting)} onClick={() => void (isBroll || isSfx ? exportCurrentEdit() : start())} className={sceneActionClass}>{exporting?<Loader2 size={14} className="animate-spin"/>:<Download size={14}/>} {exporting ? `${say('导出中','Exporting')} ${Math.round(exportProgress*100)}%` : versions.length ? say('导出','Export') : say('下载','Download')}</button>}
  </div>;
  return <section className="studio-scope mx-auto flex h-full min-h-0 w-full flex-1 max-w-[1440px] flex-col overflow-hidden px-5 py-5 sm:px-10">
    <Dialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
      <DialogContent className="studio-scope bg-panel border-line sm:max-w-sm">
        <DialogTitle className="text-ink">{say('重新生成？', 'Generate again?')}</DialogTitle>
        <DialogDescription className="text-ink-3">{say('已有生成结果，继续将新增一个版本。', 'A result already exists. Continuing creates a new version.')}</DialogDescription>
        <div className="flex justify-end gap-3"><button type="button" onClick={() => setConfirmGenerate(false)} className="text-ink-3 px-4 py-2 text-sm">{say('取消', 'Cancel')}</button><button type="button" disabled={busy} onClick={() => { setConfirmGenerate(false); void start(false, true); }} className={actionClass}>{say('确认生成', 'Generate')}</button></div>
      </DialogContent>
    </Dialog>
    <button type="button" disabled={busy} onClick={onBack} className="text-ink-3 mb-4 inline-flex shrink-0 self-start items-center gap-2 text-sm disabled:opacity-40"><ArrowLeft size={15} />{say('返回首页', 'Back to home')}</button>
    <header className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-4"><div><h1 className="text-ink text-2xl font-semibold tracking-tight">{isUgc ? say('UGC 广告', 'UGC Ad') : isRemoval ? say('智能擦除', 'AI Eraser') : isSfx ? 'Auto SFX' : isPip ? say('画中画', 'Picture in picture') : isBroll ? 'AI B-Roll' : isDubbing ? 'Video Dubbing' : 'AI Captions'}</h1><p className="text-ink-3 mt-2 truncate text-sm">{task.name}</p></div></header>
    <input ref={inputRef} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={(event) => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void pickFile(next); }} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(160px,28%)_minmax(0,1fr)] gap-5 overflow-hidden md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-2" aria-label={isUgc ? say('UGC 广告设置', 'UGC ad settings') : isRemoval ? say('智能擦除设置', 'AI eraser settings') : isSfx ? say('自动音效设置', 'Auto SFX settings') : isPip ? say('画中画设置', 'Picture in picture settings') : isBroll ? say('配画面设置', 'B-roll settings') : isDubbing ? say('译制设置', 'Dubbing settings') : say('字幕设置', 'Caption settings')}>
        <div className="pb-5 pr-2">
        {!isRemoval && <SceneBrandPicker options={options} locale={locale} disabled={disabled} onChange={changeOptions} />}
        {isUgc && <><UgcAdSettings value={options.ugcAd ?? DEFAULT_UGC_AD_OPTIONS} locale={locale} disabled={disabled} onChange={ugcAd => changeOptions(current => ({ ...current, ugcAd }))} /><div className="border-line mt-5 border-t pt-5"><SceneSelect label={say('画面比例', 'Aspect ratio')} value={options.aspect === 'original' ? 'original' : 'portrait'} disabled={disabled} onChange={aspect => changeOptions(current => ({ ...current, aspect }))} options={[{ value: 'portrait', label: say('竖屏 9:16', 'Portrait 9:16') }, { value: 'original', label: say('保持原片', 'Original') }]} /></div><div className="border-line mt-5 border-t pt-5"><p className="text-ink mb-2 text-xs font-medium">{say('商品画面（可选）', 'Product footage (optional)')}</p></div></>}
        {isRemoval && <><SubtitleRemovalSettings value={options.subtitleRemoval ?? DEFAULT_SUBTITLE_REMOVAL} locale={locale} disabled={disabled} onChange={subtitleRemoval => changeOptions(current => ({ ...current, subtitleRemoval, shortenPauses: false, translationLanguage: undefined }))}/>{removalAvailable !== true && <p role="status" className="text-ink-3 mt-4 text-xs">{removalAvailable === null ? say('正在连接处理服务…', 'Connecting to the service…') : say('当前擦除模式暂未开通，可先预览并设置区域。', 'This removal mode is not available yet. You can preview and select a region.')}</p>}</>}
        {isSfx && <SfxSettings value={options.sfx ?? DEFAULT_SFX_OPTIONS} locale={locale} disabled={disabled} onChange={sfx => changeOptions(current => ({ ...current, sfx, shortenPauses: false, translationLanguage: undefined }))}/>}
        {isBroll && <FootageSettings task={brollViewTask ?? task} value={options.broll ?? { assets: [], captions: true }} locale={locale} disabled={disabled} onBusy={setPreparing} onChange={(broll) => changeOptions(current => ({ ...current, broll, shortenPauses: false, translationLanguage: undefined }))} />}
        {isDubbing ? <><DubbingSettings transcript={task.transcript} value={options.dubbing ?? DEFAULT_DUBBING_OPTIONS} locale={locale} disabled={disabled} onChange={(dubbing) => changeOptions((current) => ({ ...current, dubbing: dubbingSceneOptions(dubbing) }))} />
        <div className="mt-5 space-y-4">
          <SceneCheckbox label={say('字幕', 'Captions')} checked={!!options.dubbing?.captions} disabled={disabled} onChange={captions => changeOptions(current => ({ ...current, dubbing: { ...dubbingSceneOptions(current.dubbing ?? DEFAULT_DUBBING_OPTIONS), captions } }))} />
          {options.dubbing?.captions && <><CaptionPresetCarousel options={options} source={probe ?? undefined} locale={locale} disabled={disabled} onSelect={(presetId) => changeOptions((current) => ({ ...current, presetId, custom: undefined }))} /><CaptionTaskCustomize options={options} source={probe ?? undefined} locale={locale} disabled={disabled} onChange={(patch) => changeOptions((current) => ({ ...current, custom: { ...current.custom, ...patch } }))} onReset={() => changeOptions((current) => ({ ...current, layoutVersion: 2, custom: undefined }))} /></>}
        </div></> : ((isSfx || isRemoval) ? false : !isBroll || options.broll?.captions) ? <>
        <CaptionPresetCarousel options={options} source={probe ?? undefined} locale={locale} disabled={disabled} onSelect={(presetId) => changeOptions((current) => ({ ...current, presetId, custom: undefined }))} />
        {!isBroll && !isSfx && (!!studioProviders().translate || options.translationLanguage) && <div className="border-line mt-5 border-t pt-5">
          <SceneSelect label={say('双语字幕', 'Bilingual captions')} ariaLabel={say('翻译语言', 'Translation language')} value={options.translationLanguage ?? 'off'} disabled={disabled} onChange={value => changeOptions(current => ({ ...current, translationLanguage: CAPTION_TRANSLATION_LANGUAGES.find(language => language.id === value)?.id }))} options={[
            { value: 'off', label: say('关闭', 'Off') }, ...CAPTION_TRANSLATION_LANGUAGES.map(language => ({ value: language.id, label: language.name[locale], disabled: !studioProviders().translate })),
          ]} />{options.translationLanguage && <p className="text-ink-3 mt-2 text-xs">{say('原文在上，译文在下。', 'Original above, translation below.')}</p>}
        </div>}
        <CaptionTaskCustomize options={options} source={probe ?? undefined} locale={locale} disabled={disabled} onChange={(patch) => changeOptions((current) => ({ ...current, custom: { ...current.custom, ...patch } }))} onReset={() => changeOptions((current) => ({ ...current, layoutVersion: 2, custom: undefined }))} />
        {!isBroll && !isSfx && <div className="border-line mt-5 border-t pt-5"><SceneCheckbox label={say('AI 去停顿', 'Shorten pauses')} checked={options.shortenPauses} disabled={disabled} onChange={shortenPauses => changeOptions(current => ({ ...current, shortenPauses }))} description={say('缩短长停顿，保留自然语气。', 'Trim long pauses while keeping speech natural.')} /></div>}
        </> : null}
        {isSfx && !drafting && selectedVersion?.task.document && <p className="text-ink-3 mt-5 text-xs" role="status">{say('已添加音效', 'Effects added')}: {selectedVersion.task.document.timeline.tracks.filter(track => track.role === 'sfx').reduce((count, track) => count + track.clips.length, 0)}</p>}
        {!file && <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="text-ink mt-4 flex items-center gap-2 text-sm"><Upload size={16} />{say('重新选择原视频', 'Re-select source video')}</button>}
        {error && <p role="alert" className="text-ink mt-4 text-sm leading-relaxed">{retrySfx ? say('上次匹配未完成，请重新匹配音效。已识别的讲话会继续使用。', 'The previous attempt did not complete. Match sounds again using the saved transcript.') : error}</p>}{storageNote && <p role="status" className="text-ink-3 mt-3 text-xs leading-relaxed">{storageNote}{studioProviders().sceneProjects && <button type="button" disabled={disabled} className="ml-2 underline" onClick={() => { setPreparing(true); void syncCaptionProject(scope!, taskId).then(() => setStorageNote('')).catch((error) => setStorageNote(error instanceof Error ? error.message : say('同步失败，请重试。', 'Sync failed. Try again.'))).finally(() => setPreparing(false)); }}>{say('重试同步', 'Retry sync')}</button>}</p>}
        </div>
        <div className="bg-bg sticky bottom-0 z-20 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {resumable && !busy && <button type="button" disabled={!file || disabled} onClick={() => void start(true)} className="text-ink-3 mt-3 w-full text-xs underline">{say('继续上次处理', 'Resume last run')}</button>}
        {retrySfx && <p className="text-ink-3 mb-2 text-xs">{say('重新匹配会发起新的 AI 请求，可能产生匹配费用。', 'Matching again starts a new AI request and may incur a matching charge.')}</p>}
        <SceneCreditPreview task={task} options={isSfx ? { ...options, sfx: normalizeSfxOptions(options.sfx) } : options} locale={locale} busy={busy || preparing} />
        <button type="button" disabled={!file || !scope || disabled || (isUgc && (!options.ugcAd?.productName.trim() || !options.ugcAd?.callToAction.trim())) || (isRemoval && removalAvailable !== true) || (isBroll && !isUgc && !options.broll?.assets.length) || (isDubbing && (!options.dubbing || !dubbingVoicesReady(task.transcript ?? [], options.dubbing)))} onClick={() => void start()} className={actionClass + ' mt-3 w-full'}>{busy || preparing ? <Loader2 size={16} className="animate-spin" /> : null}{busy ? say('正在生成…', 'Generating…') : retrySfx ? say('重新匹配音效', 'Match sounds again') : versions.length ? say('生成新版本', 'Generate new version') : isRemoval ? say('开始擦除', 'Start erasing') : isUgc ? say('生成广告', 'Generate ad') : (isBroll || isSfx) ? say('生成视频', 'Generate video') : isDubbing ? say('生成译制视频', 'Generate dubbed video') : say('生成字幕视频', 'Generate captioned video')}</button>
        </div>
      </section>
      <section aria-label={say('视频预览', 'Video preview')} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {isSfx && !busy && !versionLoading ? (sfxViewTask && file ? <SfxTimeline task={sfxViewTask} source={file} locale={locale} disabled={disabled} actions={videoActions()} onChange={editSfxDocument}/> : <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-4 text-sm"><p>{say('请重新选择原视频以预览独立音效轨。', 'Re-select the original video to preview the sound tracks.')}</p>{videoActions()}</div>) : isBroll && !isUgc && brollViewTask?.broll?.planKey && brollAssetsMatch(brollViewTask.broll.analysisKey, options.broll?.assets ?? []) && file && !busy && !versionLoading ? <BrollTimeline actions={videoActions} task={brollViewTask} options={options} source={file} renderedUrl={playable ? resultUrl : undefined} locale={locale} disabled={disabled} onChange={broll => {
          if (!drafting && selectedVersion && taskRef.current) { const next = { ...taskRef.current, broll: selectedVersion.task.broll, transcript: selectedVersion.task.transcript }; taskRef.current = next; setTask(next); }
          changeOptions(current => ({ ...current, broll }));
        }} /> : (
        <SceneVideoPreview source={file} resultUrl={playable ? resultUrl : undefined} poster={firstFrame || cover} width={probe?.width ?? task.width} height={probe?.height ?? task.height} duration={task.durationSec} disabled={disabled} locale={locale} actions={videoActions()}>
          {!playable && <>
            {isRemoval && options.subtitleRemoval?.mode === 'region' && options.subtitleRemoval.region && !busy && !versionLoading && <SubtitleRegionOverlay region={options.subtitleRemoval.region} locale={locale} disabled={disabled} onChange={region => changeOptions(current => ({ ...current, subtitleRemoval: { ...current.subtitleRemoval, mode: 'region', region } }))}/>}
            {isPip && !busy && !versionLoading && <PipLayoutPreview options={options.broll?.pip ?? DEFAULT_PIP_OPTIONS} source={firstFrame || cover} canvas={probe ?? task} asset={options.broll?.assets[0]} scope={task.scope} locale={locale}/>}
            {(((isSfx || isRemoval) ? false : isBroll ? options.broll?.captions : !isDubbing) || options.dubbing?.captions) && !busy && !versionLoading && <CaptionPositionPreview options={options} source={probe ?? { width: 1080, height: 1920 }} locale={locale} disabled={disabled} onChange={(yPct) => changeOptions((current) => {
              const custom = { ...current.custom };
              if (yPct === captionTaskGroupBottom({ ...current, custom: undefined }, probe ?? { width: 1080, height: 1920 })) delete custom.yPct;
              else custom.yPct = yPct;
              return { ...current, custom: Object.keys(custom).length ? custom : undefined };
            }, true)} />}
          </>}
          {versionLoading && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/70 text-white"><Loader2 size={24} className="animate-spin" /><span className="sr-only">{say('读取版本', 'Loading version')}</span></div>}
          {busy && <CaptionProgressOverlay options={task.options} progress={progress} locale={locale} stopping={stopping} onStop={() => { abortRef.current?.abort(); setStopping(true); }} />}
        </SceneVideoPreview>
        )}
      </section>
    </div>
  </section>;
}
