import { useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, Clock3, Loader2, Play, Save, Workflow as WorkflowIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { STUDIO_WORKFLOW_CAPABILITIES, STUDIO_WORKFLOW_TEMPLATES, workflowTemplate } from '@pireel/studio-engine/workflow-catalog';
import { createWorkflowRun, resolveWorkflowInputs, type WorkflowDefinition, type WorkflowInputs, type WorkflowRun } from '@pireel/studio-engine/workflow';
import { executeWorkflow } from '@pireel/studio-engine/workflow-runtime';
import { createStudioWorkflowExecutor, type WorkflowStudioHost } from './workflow-studio-adapter';
import { parseWorkflowBrowserState, storeWorkflowRun, workflowStorageKey, type WorkflowBrowserState } from './workflow-storage';
import { loadCurrentUser } from './current-user';
import { WORKFLOW_ART } from './workflow-art';
import { studioLocale } from './i18n';

export interface WorkflowPanelProps {
  projectId: string;
  initialTemplateId?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  host: WorkflowStudioHost;
  blocked: boolean;
  onBusyChange(busy: boolean): void;
  onImport(): void;
}
const inputClass = 'border-line bg-bg text-ink h-10 w-full rounded-md border px-3 text-sm outline-none focus:border-ink-3 focus:ring-2 focus:ring-ring/20 disabled:opacity-50';
const buttonClass = 'border-line text-ink hover:bg-panel-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40';
const emptyState = (): WorkflowBrowserState => ({ schemaVersion: 1, definitions: [], runs: [] });

export function WorkflowPanel(props: WorkflowPanelProps) {
  const locale = studioLocale() === 'zh' ? 'zh' : 'en';
  const zh = locale === 'zh';
  const say = (cn: string, en: string) => zh ? cn : en;
  const formId = useId();
  const initial = workflowTemplate(props.initialTemplateId ?? '') ?? STUDIO_WORKFLOW_TEMPLATES[0];
  const [definition, setDefinition] = useState<WorkflowDefinition>(() => structuredClone(initial.definition));
  const [inputs, setInputs] = useState<WorkflowInputs>(() => resolveWorkflowInputs(initial.definition, {}));
  const [name, setName] = useState(initial.title[locale]);
  const [browserState, setBrowserState] = useState<WorkflowBrowserState>(emptyState);
  const stateRef = useRef(browserState);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const [stopping, setStopping] = useState(false);
  const hostRef = useRef(props.host);
  hostRef.current = props.host;
  const template = workflowTemplate(definition.templateId) ?? initial;
  const context = props.host.context();

  useEffect(() => {
    let alive = true;
    loadCurrentUser().catch(() => null).then((user) => {
      if (!alive) return;
      const key = workflowStorageKey(user?.user_id ?? 'local', props.projectId);
      try {
        const stored = parseWorkflowBrowserState(localStorage.getItem(key));
        stateRef.current = stored; setBrowserState(stored); setStorageKey(key);
      } catch {
        setError(zh ? '无法读取本机工作流记录。请检查浏览器存储权限。' : 'Unable to read workflow history. Check browser storage permissions.');
      }
    });
    return () => { alive = false; abortRef.current?.abort(); };
  }, [props.projectId, zh]);

  // Refs let the run use the newest Studio state without recreating the executor between steps.
  const host: WorkflowStudioHost = {
    context: () => hostRef.current.context(),
    assertWritable: () => hostRef.current.assertWritable(),
    prepareMedia: () => hostRef.current.prepareMedia(),
    call: (tool, args) => hostRef.current.call(tool, args),
  };
  const persist = (state: WorkflowBrowserState) => {
    if (!storageKey) throw new Error(say('本机存储尚未就绪', 'Device storage is not ready'));
    localStorage.setItem(storageKey, JSON.stringify(state));
    stateRef.current = state; setBrowserState(state);
  };
  const choose = (next: WorkflowDefinition) => {
    if (busyRef.current) return;
    setDefinition(structuredClone(next)); setInputs(resolveWorkflowInputs(next, {}));
    setName(next.id.startsWith('custom.') ? next.title : (workflowTemplate(next.templateId)?.title[locale] ?? next.title));
    setRun(null); setError(''); setSaved(false);
  };
  const saveDefinition = () => {
    try {
      if (!name.trim()) throw new Error(say('请给工作流起个名字', 'Name this workflow'));
      const values = resolveWorkflowInputs(definition, inputs);
      const custom = definition.id.startsWith('custom.');
      if (!custom && stateRef.current.definitions.length >= 50) throw new Error(say('本机最多保存 50 个工作流', 'This device can save up to 50 workflows'));
      const next: WorkflowDefinition = structuredClone({
        ...definition, id: custom ? definition.id : 'custom.' + crypto.randomUUID(),
        version: custom ? definition.version + 1 : 1, title: name.trim().slice(0, 100),
        parameters: Object.fromEntries(Object.entries(definition.parameters).map(([key, parameter]) => [key, { ...parameter, default: values[key] as string | number | boolean }])),
      });
      persist({ ...stateRef.current, definitions: [next, ...stateRef.current.definitions.filter((item) => item.id !== next.id)] });
      setDefinition(next); setSaved(true); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const start = async () => {
    if (busyRef.current || props.blocked || !storageKey) return;
    setError(''); setSaved(false); setStopping(false);
    busyRef.current = true; setBusy(true); props.onBusyChange(true);
    const abort = new AbortController(); abortRef.current = abort;
    try {
      const snapshot = host.context();
      if (!snapshot.hasContent) throw new Error(say('请先添加素材到时间线', 'Add media to the timeline first'));
      if (!name.trim()) throw new Error(say('请给工作流起个名字', 'Name this workflow'));
      const next = createWorkflowRun({ ...definition, title: name.trim() }, inputs, snapshot.source, STUDIO_WORKFLOW_CAPABILITIES, crypto.randomUUID());
      setRun(next);
      const result = await executeWorkflow(next, STUDIO_WORKFLOW_CAPABILITIES, createStudioWorkflowExecutor(host, zh), {
        save: async (checkpoint) => persist(storeWorkflowRun(stateRef.current, checkpoint)),
      }, { signal: abort.signal, onChange: setRun });
      setRun(result);
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) + say('。如已有步骤执行，请先检查当前版本。', '. If a step already ran, review the current version first.'));
    } finally {
      busyRef.current = false; setBusy(false); props.onBusyChange(false); abortRef.current = null;
    }
  };
  const completed = run?.steps.filter((step) => step.status === 'completed').length ?? 0;
  const visibleSteps = definition.steps.filter((step) => !step.enabledBy || inputs[step.enabledBy] === true);
  const searchArtifact = run?.steps.find((step) => step.artifact?.kind === 'segments')?.artifact?.data.segments;
  const needsTranscript = visibleSteps.some((step) => step.capability === 'transcript.ensure') && !context.hasTranscript;
  const readOnly = visibleSteps.every((step) => STUDIO_WORKFLOW_CAPABILITIES.find((cap) => cap.id === step.capability)?.effect === 'read');

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!busyRef.current) props.onOpenChange(open); }}>
      <DialogContent overlayClassName="z-[190]" className="studio-scope z-[200] bg-bg border-line flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[880px]" showCloseButton={!busy}>
        <DialogHeader className="border-line border-b px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-ink flex items-center gap-2 text-lg"><WorkflowIcon size={19} />{say('场景工作流', 'Workflows')}</DialogTitle>
          <DialogDescription className="text-ink-3 text-xs">{say('配置一次，把熟悉的做法留给下一次。', 'Make a familiar task repeatable.')}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[220px_1fr]">
          <aside className="bg-panel/40 border-line border-b p-3 md:border-b-0 md:border-r">
            <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
              {STUDIO_WORKFLOW_TEMPLATES.map((item) => (
                <button key={item.id} type="button" disabled={busy} onClick={() => choose(item.definition)} className={'flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs transition-colors focus-visible:outline-accent ' + (definition.id === item.definition.id ? 'bg-panel-2 text-ink font-semibold' : 'text-ink-2 hover:bg-panel')}>
                  <img alt="" src={WORKFLOW_ART[item.art]} width={42} height={42} className="size-[42px] shrink-0 rounded-md" />
                  {item.title[locale]}
                </button>
              ))}
            </div>
            <p className="text-ink-3 mb-2 mt-6 px-2 text-xs font-medium">{say('我的工作流', 'My workflows')}</p>
            {browserState.definitions.length === 0 ? <p className="text-ink-3 px-2 text-xs leading-relaxed">{say('喜欢这套设置？保存后就能再次使用。', 'Save your preferred settings to use them again.')}</p> : browserState.definitions.map((item) => (
              <button key={item.id} type="button" disabled={busy} onClick={() => choose(item)} className={'mb-1 block w-full truncate rounded-md px-2 py-2 text-left text-xs ' + (definition.id === item.id ? 'bg-panel-2 text-ink' : 'text-ink-2 hover:bg-panel')}>{item.title}</button>
            ))}
            <p className="text-ink-4 mt-4 px-2 text-[11px] leading-relaxed">{say('设置与运行记录保存在此浏览器的当前项目中。', 'Settings and history are saved in this browser for this project.')}</p>
          </aside>
          <main className="min-w-0 px-6 py-5">
            <h3 className="text-ink text-xl font-semibold tracking-tight">{template.title[locale]}</h3>
            <p className="text-ink-3 mb-5 mt-2 text-xs leading-relaxed">{template.detail[locale]}</p>
            <div className="border-line mb-5 rounded-md border px-3 py-3">
              <span className="text-ink-3 text-[11px]">{say('输入作品', 'Source output')}</span>
              <p className="text-ink mt-1 truncate text-sm font-medium">{context.title || say('未命名作品', 'Untitled output')}</p>
              <p className="text-ink-3 mt-1 text-xs">{readOnly ? say('查找结果不会修改作品。', 'Searching does not change the output.') : say('先创建独立版本，原作品保留。', 'A separate version keeps your original intact.')}</p>
              {!context.hasContent && <button type="button" onClick={props.onImport} className={buttonClass + ' mt-3'}>{say('添加素材', 'Add media')}</button>}
            </div>
            <fieldset disabled={busy} className="space-y-4">
              <label htmlFor={formId + '-name'} className="text-ink-2 block text-xs font-medium">{say('工作流名称', 'Workflow name')}
                <input id={formId + '-name'} maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} className={inputClass + ' mt-2'} />
              </label>
              {Object.entries(definition.parameters).map(([key, parameter]) => {
                if (key === 'captionStyle' && 'addCaptions' in definition.parameters && inputs.addCaptions !== true) return null;
                const id = formId + '-' + key;
                if (parameter.type === 'boolean') return <label key={key} htmlFor={id} className="text-ink-2 flex items-center gap-2 text-sm"><input id={id} type="checkbox" checked={inputs[key] === true} onChange={(e) => { setInputs((prev) => ({ ...prev, [key]: e.target.checked })); setSaved(false); }} className="size-4 accent-[var(--color-accent)]" />{parameter.label[locale]}</label>;
                return <label key={key} htmlFor={id} className="text-ink-2 block text-xs font-medium">{parameter.label[locale]}
                  {parameter.options ? <select id={id} value={String(inputs[key])} onChange={(e) => { setInputs((prev) => ({ ...prev, [key]: e.target.value })); setSaved(false); }} className={inputClass + ' mt-2'}>{parameter.options.map((option) => <option key={option.value} value={option.value}>{option.label[locale]}</option>)}</select>
                    : <input id={id} type={parameter.type === 'number' ? 'number' : 'text'} step={parameter.type === 'number' ? '0.05' : undefined} min={parameter.min} max={parameter.max} maxLength={parameter.maxLength} value={typeof inputs[key] === 'number' && !Number.isFinite(inputs[key]) ? '' : String(inputs[key])} onChange={(e) => { const value = parameter.type === 'number' ? e.target.valueAsNumber : e.target.value; setInputs((prev) => ({ ...prev, [key]: value })); setSaved(false); }} className={inputClass + ' mt-2'} />}
                </label>;
              })}
            </fieldset>
            <section className="mt-6" aria-label={say('执行步骤', 'Steps')}>
              <p className="text-ink-3 mb-3 text-xs font-medium">{say('执行步骤', 'Steps')}</p>
              <ol className="space-y-2.5">
                {visibleSteps.map((step, i) => {
                  const record = run?.steps.find((item) => item.id === step.id);
                  return <li key={step.id} className="flex gap-2.5 text-xs">
                    <span className="text-ink-3 mt-0.5 flex size-4 shrink-0 items-center justify-center">{record?.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : record?.status === 'completed' ? <Check size={14} /> : i + 1}</span>
                    <div className="min-w-0"><span className="text-ink-2">{STUDIO_WORKFLOW_CAPABILITIES.find((cap) => cap.id === step.capability)?.label[locale]}</span>{record?.summary && <p className="text-ink-3 mt-1 break-words leading-relaxed">{record.summary}</p>}</div>
                  </li>;
                })}
              </ol>
            </section>
            <div className="text-ink-3 mt-5 space-y-1 text-xs leading-relaxed">
              <p>{say('运行期间请保持此 Studio 页面打开。', 'Keep this Studio page open while it runs.')}</p>
              {needsTranscript && <p>{say('缺少转写时会调用转写服务，可能消耗账户积分。', 'Missing transcripts use your transcription service and may consume credits.')}</p>}
              <p className="flex items-start gap-1.5"><Clock3 size={13} className="mt-0.5 shrink-0" />{say('当前手动运行；定时制作与自媒体定时发布暂未启用。', 'Manual runs are available. Scheduled production and social publishing are not enabled yet.')}</p>
            </div>
            {(error || run?.error) && <p role="alert" className="border-line text-ink mt-4 rounded-md border p-3 text-xs leading-relaxed">{error || run?.error}</p>}
            {props.blocked && <p role="status" className="text-ink-3 mt-3 text-xs">{say('请等待 Studio 就绪或当前编辑任务结束。', 'Wait for Studio to be ready and the current editing task to finish.')}</p>}
            {run && <p role="status" aria-live="polite" className="text-ink mt-4 flex items-center gap-2 text-sm">{run.status === 'completed' && <CheckCircle2 size={16} />}{run.status === 'completed' ? say('已完成，可在 Studio 中检查结果', 'Done. Review the result in Studio.') : run.status === 'cancelled' ? say('已停止后续步骤，已完成的改动保留', 'Stopped. Completed changes are retained.') : run.status === 'failed' ? say('运行未完成，已完成的步骤保留', 'The run stopped. Completed steps are retained.') : say('已完成 ' + completed + ' 个步骤', completed + ' steps completed')}</p>}
            {Array.isArray(searchArtifact) && <div className="mt-4 space-y-2">{searchArtifact.length === 0 ? <p className="text-ink-3 text-xs">{say('没有匹配片段。试试更具体的关键词。', 'No matching moments. Try a more specific keyword.')}</p> : searchArtifact.map((segment, i) => <div key={i} className="border-line rounded-md border p-3 text-xs">
                <p className="text-ink-3 mb-1">{segment && typeof segment === 'object' && !Array.isArray(segment) ? formatSegmentTime(segment.sourceStartSec, segment.sourceEndSec) : ''}</p>
                <p className="text-ink-2 leading-relaxed">{segment && typeof segment === 'object' && !Array.isArray(segment) && typeof segment.transcript === 'string' ? segment.transcript : say('匹配片段', 'Matching moment')}</p>
              </div>)}</div>}
            {browserState.runs.length > 0 && !busy && <details className="text-ink-3 mt-5 text-xs"><summary className="cursor-pointer">{say('最近运行', 'Recent runs')} ({browserState.runs.length})</summary><ul className="mt-3 space-y-2">{browserState.runs.slice(0, 5).map((item) => <li key={item.id} className="flex justify-between gap-3"><span className="truncate">{item.definition.title}</span><span>{statusLabel(item.status, zh)}</span></li>)}</ul></details>}
          </main>
        </div>
        <footer className="border-line bg-bg flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <button type="button" disabled={busy || !storageKey} onClick={saveDefinition} className={buttonClass}>{saved ? <Check size={15} /> : <Save size={15} />}{saved ? say('已保存', 'Saved') : say('保存为我的工作流', 'Save workflow')}</button>
          {busy ? <button type="button" disabled={stopping} onClick={() => { abortRef.current?.abort(); setStopping(true); }} className={buttonClass}>{stopping ? say('等待当前步骤结束…', 'Finishing the current step…') : say('停止后续步骤', 'Stop after this step')}</button> : <button type="button" disabled={props.blocked || !context.hasContent || !storageKey} onClick={() => void start()} className="bg-primary text-primary-foreground inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"><Play size={14} />{say('运行工作流', 'Run workflow')}</button>}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function statusLabel(status: WorkflowRun['status'], zh: boolean): string {
  const labels = {
    ready: ['待运行', 'Ready'], running: ['运行中', 'Running'], waiting: ['等待中', 'Waiting'],
    completed: ['已完成', 'Completed'], failed: ['未完成', 'Failed'], cancelled: ['已停止', 'Stopped'], interrupted: ['已中断，请检查作品', 'Interrupted; review output'],
  };
  return labels[status]?.[zh ? 0 : 1] ?? status;
}

function formatSegmentTime(start: unknown, end: unknown): string {
  const time = (value: unknown) => { const n = Number(value); if (!Number.isFinite(n)) return ""; return Math.floor(n / 60) + ":" + Math.floor(n % 60).toString().padStart(2, "0"); };
  return time(start) + " – " + time(end);
}
