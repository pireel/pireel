import { useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import { Check, Film, Loader2, Minus, X } from 'lucide-react';
import { imageThumb } from '@pireel/ui/image-url';
import type { ChatTask } from './chat-task';
import type { FineCutItem, FirstPassReport } from './first-pass';
import { editingTaskRows, type EditingProgressRow } from './editing-task-progress';
import { useToolProgress } from './tool-progress';
import { studioLocale, t } from './i18n';

export function EditingTaskCard({ task, messages, live, fine, credits, startedAt, onContinue }: {
  task: ChatTask; messages: UIMessage[]; live: boolean; fine?: { items: FineCutItem[] }; credits: number; startedAt?: number; onContinue?: () => void;
}) {
  const zh = studioLocale().startsWith('zh');
  const say = (cn: string, en: string) => zh ? cn : en;
  const working = live || task.state === 'running';
  const progress = useToolProgress('rough_cut');
  const report = (live ? progress?.report as FirstPassReport | undefined : undefined) ?? task.roughCut?.report;
  const rows = editingTaskRows(task, report, messages, live, fine);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!working) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [working]);
  const names: Record<string, string> = {
    transcribe: say('识别口播', 'Transcribing your video'), cleanup: say('清理口播', 'Cleaning up the take'),
    planning: say('构思剪辑', 'Directing the edit'),
    pauses: say('缩短停顿', 'Trimming pauses'), captions: say('制作字幕', 'Adding captions'),
    denoise: say('清理人声', 'Cleaning up narration'), logo: say('添加 Logo', 'Adding logo'), loudness: say('调整音量', 'Balancing audio'),
    graphics: say('设计画面与花字', 'Designing visuals'), 'b-roll': say('搭配素材', 'Gathering B-roll'), sound: say('处理音效', 'Adding sound effects'), zoom: say('自动缩放', 'Auto zoom'), transitions: say('转场', 'Transitions'), review: say('检查预览', 'Checking the preview'),
  };
  const card = (title: string, entries: EditingProgressRow[]) => entries.length > 0 && <section aria-label={title} className="bg-panel-2/60 border-line rounded-2xl border px-4 py-3.5">
    <h3 className="text-ink-3 mb-3 text-xs font-medium">{title}</h3>
    <ul className="space-y-3">{entries.map(row => <li key={row.id} className="flex items-start gap-2.5 text-[13px]">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{row.status === 'done' ? <Check size={15} className="text-ink-3" /> : row.status === 'running' ? <Loader2 size={15} className="animate-spin text-ink" /> : row.status === 'failed' ? <X size={15} className="text-destructive" /> : row.status === 'skipped' ? <Minus size={14} className="text-ink-4" /> : <span className="border-ink-4 size-3 rounded-full border border-dashed" />}</span>
      <div className="min-w-0 flex-1"><span className={row.status === 'running' ? 'text-ink' : 'text-ink-3'}>{names[row.id]}</span>
        {row.status === 'running' && row.detail && <p className="text-ink-4 mt-1 text-xs">{row.detail === 'cleanup' ? say('去除重复与口头禅', 'Trimming fillers and retakes') : names[row.detail]}</p>}
        {row.reason && row.status !== 'done' && <p className="text-ink-4 mt-1 text-xs leading-relaxed">{row.reason}</p>}
      </div>
      {row.status === 'failed' && <span className="text-destructive text-xs">{say('未完成', 'Incomplete')}</span>}
      {row.status === 'skipped' && <span className="text-ink-4 text-xs">{say('未添加', 'Not added')}</span>}
      {row.status === 'done' && !!row.count && <span className="text-ink-4 text-xs">{say(`${row.count} 处`, `${row.count}`)}</span>}
      {row.status === 'running' && !!row.count && <span className="text-ink-4 shrink-0 text-xs">{say(`已添加 ${row.count} 处`, `${row.count} added`)}</span>}
    </li>)}</ul>
  </section>;
  const active = [...rows.rough, ...(rows.planning ? [rows.planning] : []), ...rows.finishing].find(row => row.status === 'running');
  const showFinishing = (!task.directorPlanRequired || !!task.directorPlan) && (rows.rough.every(row => row.status === 'done') || rows.finishing.some(row => ['running', 'done', 'failed'].includes(row.status)));
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  return <div className="w-full space-y-3" aria-label={say('剪辑进度', 'Editing progress')}>
    {task.source && <div className="border-line flex items-center gap-3 rounded-xl border px-3 py-2.5">
      {task.source.posterKey ? <img src={imageThumb(task.source.posterKey, 'thumb')} alt="" className="size-10 rounded-md object-cover" /> : <span className="bg-panel-2 text-ink-3 flex size-10 shrink-0 items-center justify-center rounded-md"><Film size={19} /></span>}
      <div className="min-w-0"><p className="text-ink truncate text-xs font-medium">{task.source.name}</p>{task.source.durationSec != null && <p className="text-ink-4 mt-1 text-xs">{Math.floor(task.source.durationSec / 60)}:{String(Math.floor(task.source.durationSec % 60)).padStart(2, '0')}</p>}</div>
    </div>}
    {card(rows.rough.some(row => row.id === 'cleanup') ? say('粗剪', 'Rough cut') : say('准备视频', 'Preparing your video'), rows.rough)}
    {report?.summary && <p className="text-ink-2 text-[13px] leading-relaxed">{report.summary}</p>}
    {rows.planning && (rows.planning.status !== 'pending' || rows.rough.every(row => row.status === 'done')) && <section aria-label={names.planning} className="bg-panel-2/60 border-line rounded-2xl border px-4 py-3.5">
      <div className="text-ink-3 flex items-center gap-2.5 text-[13px]">{rows.planning.status === 'done' ? <Check size={15} /> : rows.planning.status === 'running' ? <Loader2 size={15} className="animate-spin" /> : <span className="border-ink-4 size-3 rounded-full border border-dashed" />}<h3>{names.planning}</h3></div>
      {task.directorPlan && <div className="text-ink-2 mt-3 space-y-2 text-xs leading-relaxed">
        <p>{task.directorPlan.direction}</p>
        {task.directorPlan.brandTreatment && <p>{task.directorPlan.brandTreatment}</p>}
        <details><summary className="text-ink-3 cursor-pointer">{say('段落安排', 'Scene direction')}</summary>
          <ul className="mt-3 space-y-3">{task.directorPlan.beats.map(beat => {
            const result = task.review?.director?.beats.find(item => item.beatId === beat.id);
            return <li key={beat.id}><p className="text-ink font-medium">“{beat.quote}”</p><p className="mt-1">{beat.direction}</p>{result && <p className={result.status === 'blocked' ? 'text-destructive mt-1' : 'text-ink-4 mt-1'}>{result.result}</p>}</li>;
          })}</ul>
        </details>
      </div>}
    </section>}
    {showFinishing && card(say('精剪', 'Fine cut'), rows.finishing)}
    {task.review?.director?.summary && <p className="text-ink-2 text-[13px] leading-relaxed">{task.review.director.summary}</p>}
    {task.review?.brandApplication && <details className="text-ink-3 text-xs"><summary className="cursor-pointer">{say('品牌应用', 'Brand treatment')}</summary><p className="mt-2 leading-6">{task.review.brandApplication}</p></details>}
    <div className="text-ink-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" role="status">
      {working ? <><Loader2 size={12} className="animate-spin" /><span>{active ? names[active.id] : say('正在剪辑', 'Editing your video')}{seconds > 0 ? ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''}</span></> : <span>{task.state === 'done' ? say('剪辑完成', 'Edit complete') : say('剪辑尚未完成', 'Edit incomplete')}</span>}
      {credits > 0 && <span>· {t('chatGen.firstPass.credits', { n: Math.round(credits * 100) / 100 })}</span>}
      {!working && task.state !== 'done' && onContinue && <button type="button" onClick={onContinue} className="text-ink ml-auto underline underline-offset-4">{t('chatGen.continueFromCurrentState')}</button>}
    </div>
  </div>;
}
