import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileVideo, Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { STUDIO_WORKFLOW_CAPABILITIES, workflowTemplate } from '@pireel/studio-engine/workflow-catalog';
import { createWorkflowRun, type WorkflowRun } from '@pireel/studio-engine/workflow';
import { executeWorkflow } from '@pireel/studio-engine/workflow-runtime';
import { createStudioWorkflowExecutor, type WorkflowStudioHost } from './workflow-studio-adapter';
import { parseWorkflowBrowserState, storeWorkflowRun, workflowStorageKey } from './workflow-storage';
import { loadCurrentUser } from './current-user';
import { studioLocale } from './i18n';
import type { WorkflowPanelProps } from './workflow-panel';
import { CaptionExampleCards } from './caption-example-cards';
import { CAPTION_EXAMPLES } from './caption-examples';

/** Consumer entry: upload, choose a visual style, optionally shorten pauses. The workflow stays internal. */
export function CaptionsEntry(props: WorkflowPanelProps) {
  const locale = studioLocale() === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const [preset, setPreset] = useState(props.host.emphasizeCaptions ? 'kw-yellow' : 'em-yellow');
  const [shortenPauses, setShortenPauses] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const busyRef = useRef(false);
  const styleTouchedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const hostRef = useRef(props.host);
  hostRef.current = props.host;
  const current = props.host.context();
  const sourceLabel = current.sourceLabel && !/^(pireel\d*:|blob:|https?:|[a-f0-9]{24,})/i.test(current.sourceLabel)
    ? current.sourceLabel.split('#pireel=')[0] : say('当前视频', 'Current video');

  useEffect(() => {
    let alive = true;
    loadCurrentUser().catch(() => null).then((user) => {
      if (!alive) return;
      try {
        const key = workflowStorageKey(user?.user_id ?? 'local', props.projectId);
        parseWorkflowBrowserState(localStorage.getItem(key));
        setStorageKey(key);
        try {
          const saved = JSON.parse(localStorage.getItem(key + ':captions') ?? 'null') as { preset?: unknown } | null;
          if (!styleTouchedRef.current && saved && (saved.preset !== 'kw-yellow' || hostRef.current.emphasizeCaptions) && CAPTION_EXAMPLES.some((example) => example.preset === saved.preset)) setPreset(String(saved.preset));
        } catch { /* A damaged style preference must not block adding captions. */ }
      } catch { setError(zh ? '无法读取浏览器存储，请检查存储权限后重试。' : 'Browser storage is unavailable. Check its permissions and try again.'); }
    });
    return () => { alive = false; abortRef.current?.abort(); };
  }, [props.projectId, zh]);

  const resetResult = () => { setRun(null); setError(''); };
  const start = async () => {
    if (busyRef.current || props.blocked || !storageKey) return;
    busyRef.current = true; setBusy(true); setStopping(false); setError('');
    props.onBusyChange(true);
    const abort = new AbortController(); abortRef.current = abort;
    const host: WorkflowStudioHost = {
      context: () => hostRef.current.context(), assertWritable: () => hostRef.current.assertWritable(),
      prepareMedia: () => hostRef.current.prepareMedia(), emphasizeCaptions: () => hostRef.current.emphasizeCaptions!(), call: (name, args) => hostRef.current.call(name, args),
    };
    try {
      const source = host.context();
      if (!source.hasNarration) throw new Error(say('请先添加有讲话内容的视频。', 'Add a video with spoken content first.'));
      const definition = { ...workflowTemplate('captions')!.definition, title: say('字幕版', 'Captioned version') };
      const next = createWorkflowRun(definition, { captionStyle: preset, highlightKeywords: preset === 'kw-yellow', shortenPauses }, source.source, STUDIO_WORKFLOW_CAPABILITIES, crypto.randomUUID());
      localStorage.setItem(storageKey + ':captions', JSON.stringify({ preset }));
      setRun(next);
      const result = await executeWorkflow(next, STUDIO_WORKFLOW_CAPABILITIES, createStudioWorkflowExecutor(host, zh), {
        save: async (checkpoint) => {
          const stored = parseWorkflowBrowserState(localStorage.getItem(storageKey));
          localStorage.setItem(storageKey, JSON.stringify(storeWorkflowRun(stored, checkpoint)));
        },
      }, { signal: abort.signal, onChange: setRun });
      setRun(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false; setBusy(false); props.onBusyChange(false); abortRef.current = null;
    }
  };
  const activeStep = run?.steps.find((step) => step.status === 'running');
  const progress = stopping ? say('当前处理结束后停止…', 'Stopping after this step…')
    : activeStep?.id === 'pauses' ? say('正在整理讲话节奏…', 'Shortening pauses…')
    : activeStep?.id === 'emphasis' ? say('正在选择重点词…', 'Choosing key phrases…')
    : activeStep?.id === 'transcript' ? say('正在识别语音…', 'Transcribing speech…')
    : say('正在添加字幕…', 'Adding captions…');
  const completed = run?.status === 'completed';
  const failedStep = run?.steps.find((step) => step.status === 'failed')?.id;
  const failure = error || run?.error;
  const failureText = failure === 'Failed to fetch' ? say('网络连接中断，已完成的处理会保留。请检查连接后重试。', 'The connection was interrupted. Completed changes are kept. Check your connection and try again.') : failure;
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!busyRef.current) props.onOpenChange(open); }}>
      <DialogContent overlayClassName="z-[190]" className="studio-scope bg-bg border-line z-[200] flex max-h-[92dvh] flex-col gap-0 overflow-y-auto p-6 sm:max-w-[540px]" showCloseButton={!busy}>
        <DialogHeader className="pr-6 text-left">
          <DialogTitle className="text-ink text-xl font-semibold">{say('AI 字幕', 'AI Captions')}</DialogTitle>
          <DialogDescription className="text-ink-3 mt-1 text-sm">{say('自动识别讲话，配上喜欢的字幕样式。', 'Turn speech into styled, editable captions.')}</DialogDescription>
        </DialogHeader>
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="text-ink-3">{say('选择字幕样式', 'Choose your caption style')}</span><button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((value) => !value)} className="text-ink underline underline-offset-4 focus-visible:outline-accent">{showOriginal ? say('查看字幕效果', 'Show captions') : say('对比无字幕', 'Compare without captions')}</button></div>
          <CaptionExampleCards allowKeywords={!!props.host.emphasizeCaptions} locale={locale} selected={preset} disabled={busy || completed} showCaptions={!showOriginal} onSelect={(value) => { styleTouchedRef.current = true; setPreset(value); setShowOriginal(false); resetResult(); }} />
          <p className="text-ink-4 mt-2 text-center text-[11px]">{say('字幕样式示意，完成后仍可修改', 'Style examples. Captions stay editable.')}</p>
        </div>
        <div className="bg-panel mt-5 rounded-lg p-4">
          {current.hasNarration ? (
            <div className="flex items-center gap-3">
              <FileVideo size={24} className="text-ink-3 shrink-0" />
              <div className="min-w-0"><p className="text-ink truncate text-sm font-medium">{sourceLabel}</p><p className="text-ink-3 mt-1 text-xs">{say('处理后生成新版本，原视频保留', 'A new version keeps your original intact.')}</p></div>
            </div>
          ) : (
            <button type="button" disabled={busy || props.blocked} onClick={props.onImport} className="border-line text-ink hover:bg-panel-2 flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
              <Upload size={21} />{say('上传视频', 'Upload video')}
            </button>
          )}
          <label className="text-ink mt-4 flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" checked={shortenPauses} disabled={busy || completed} onChange={(event) => { setShortenPauses(event.target.checked); resetResult(); }} className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]" />
            <span><span className="text-sm font-medium">{say('AI 去停顿', 'Shorten pauses')}</span><span className="text-ink-3 mt-1 block text-xs leading-relaxed">{say('缩短说话间的长停顿，保留自然语气。', 'Trim long pauses while keeping speech natural.')}</span></span>
          </label>
        </div>
        {failure && <p role="alert" data-workflow-stage={failedStep} className="text-ink mt-4 text-sm leading-relaxed">{failureText}</p>}
        {run?.status === 'cancelled' && <p role="status" className="text-ink-3 mt-4 text-sm">{say('已停止，已完成的处理保留在新版本中。', 'Stopped. Completed changes remain in the new version.')}</p>}
        {busy && <p role="status" aria-live="polite" className="text-ink mt-4 flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{progress}</p>}
        {completed && <p role="status" className="text-ink mt-4 flex items-center gap-2 text-sm"><CheckCircle2 size={16} />{say('字幕已加好', 'Your captions are ready')}</p>}
        <div className="mt-5">
          {completed ? <button type="button" onClick={() => props.onOpenChange(false)} className="bg-ink text-bg h-11 w-full rounded-md text-sm font-semibold">{say('查看视频', 'View video')}</button>
            : busy ? <button type="button" disabled={stopping} onClick={() => { abortRef.current?.abort(); setStopping(true); }} className="border-line text-ink h-11 w-full rounded-md border text-sm disabled:opacity-50">{say('停止处理', 'Stop processing')}</button>
            : <button type="button" disabled={!current.hasNarration || !storageKey || props.blocked} onClick={() => void start()} className="bg-ink text-bg h-11 w-full rounded-md text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35">{say('开始加字幕', 'Add captions')}</button>}
        </div>
        <p className="text-ink-4 mt-3 text-center text-[11px] leading-relaxed">{props.blocked ? say('视频准备中，请稍候…', 'Preparing your video…') : say('处理时请保持页面打开。语音识别与重点词选择可能消耗积分。', 'Keep this page open. Transcription and key phrase selection may use credits.')}</p>
      </DialogContent>
    </Dialog>
  );
}
