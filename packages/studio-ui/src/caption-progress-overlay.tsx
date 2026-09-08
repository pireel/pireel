import { Check, Loader2, X } from 'lucide-react';
import { captionProcessingStages, CAPTION_STAGE_NAMES, CAPTION_PROGRESS_DETAILS } from './caption-task-progress';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { CaptionTaskProgress } from './caption-task-store';

export function CaptionProgressOverlay({ options, progress, locale, stopping, onStop }: { options: CaptionTaskOptions; progress: CaptionTaskProgress; locale: 'zh' | 'en'; stopping: boolean; onStop: () => void }) {
  const dubbed = !!options.dubbing; const cloudPending = progress.lipsync?.status === 'running';
  const zh = locale === 'zh'; const lang = zh ? 0 : 1;
  const stages = captionProcessingStages(options);
  return <div role="region" aria-label={dubbed ? (zh ? '译制生成进度' : 'Dubbing progress') : (zh ? '字幕生成进度' : 'Caption generation progress')} className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/80 p-4 text-white backdrop-blur-sm">
    <div className="my-auto w-full max-w-sm py-3">
      <h2 className="mb-5 flex items-center gap-2 text-base font-medium" aria-live="polite"><Loader2 size={17} className="animate-spin" />{stopping ? (zh ? '正在停止…' : 'Stopping…') : (dubbed ? (zh ? '正在生成译制视频' : 'Generating dubbed video') : (zh ? '正在生成字幕视频' : 'Generating captioned video'))}</h2>
      <div className="space-y-3">{stages.map((stage) => {
        const value = progress[stage]; const running = value?.status === 'running'; const complete = value?.status === 'completed';
        const detail = value?.detail ? CAPTION_PROGRESS_DETAILS[value.detail]?.[lang] : undefined;
        return <div key={stage} className={running || complete ? '' : 'opacity-45'}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2">{complete && <Check size={12} />}{CAPTION_STAGE_NAMES[stage][lang]}</span><span className="text-white/70 tabular-nums">{complete ? '100%' : detail ?? (value?.fraction != null ? `${Math.floor(value.fraction * 100)}%` : running ? (zh ? '处理中' : 'Processing') : (zh ? '等待中' : 'Waiting'))}</span></div>
          <progress aria-label={CAPTION_STAGE_NAMES[stage][lang]} max={1} value={complete ? 1 : running ? value?.fraction : 0} className="block h-1 w-full accent-white" />
          {running && (stage === 'translating' || stage === 'emphasizing') && value?.total != null && <p className="mt-1 text-right text-[10px] text-white/60">{value.done ?? 0} / {value.total} {zh ? '句' : 'lines'}</p>}
        </div>;
      })}</div>
      <p className="mt-5 text-[11px] text-white/60">{cloudPending ? (zh ? '口型任务已提交，暂停后可回来继续。' : 'Lip sync is submitted. You can pause waiting and resume later.') : (zh ? '处理期间请保持页面打开。' : 'Keep this page open while processing.')}</p>
      <button type="button" disabled={stopping} onClick={onStop} className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/80 disabled:opacity-40"><X size={13} />{cloudPending ? (zh ? '暂停等待' : 'Pause waiting') : (zh ? '停止处理' : 'Stop processing')}</button>
    </div>
  </div>;
}
