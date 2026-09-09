import { useEffect, useMemo, useState } from 'react';
import { studioProviders } from '@pireel/studio-engine/providers';
import { sceneCreditInput, type SceneCreditEstimate } from '@pireel/studio-engine/scene-credit-estimate';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';

export function SceneCreditPreview({ task, options, locale, busy }: { task: CaptionTaskRecord; options: CaptionTaskOptions; locale: 'zh' | 'en'; busy: boolean }) {
  const estimate = studioProviders().estimateSceneCredits;
  const [quote, setQuote] = useState<SceneCreditEstimate | null>(null);
  const [pending, setPending] = useState(true);
  const input = useMemo(() => { try { return JSON.stringify(sceneCreditInput(task, options)); } catch { return ''; } }, [task, options]);
  useEffect(() => {
    if (!estimate || busy) return;
    const controller = new AbortController(); setQuote(null); setPending(true);
    const timer = setTimeout(() => {
      if (!input) { setPending(false); return; }
      void estimate(JSON.parse(input), controller.signal).then((value) => { if (!controller.signal.aborted) setQuote(value); }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setPending(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [estimate, input, busy]);
  if (!estimate || busy) return null;
  const zh = locale === 'zh';
  const credits = (min: number, max: number) => min === max ? String(min) : `${min}–${max}`;
  if (!quote) return <p role="status" className="text-ink-4 mt-3 text-center text-xs">{pending ? (zh ? '正在预估积分…' : 'Estimating credits…') : (zh ? '暂时无法预估积分' : 'Credit estimate unavailable')}</p>;
  const labels = zh ? { asr: '语音识别', translation: '翻译', emphasis: '重点词', speech: '配音', lipSync: '口型同步' } : { asr: 'Transcription', translation: 'Translation', emphasis: 'Key phrases', speech: 'Voiceover', lipSync: 'Lip sync' };
  return <details className="text-ink-3 mt-3 text-xs">
    <summary className="cursor-pointer text-center">{zh ? '预计' : 'Estimated'} <span className="text-ink tabular-nums">{credits(quote.min, quote.max)}</span> {zh ? '积分' : 'credits'}</summary>
    <div className="mt-3 space-y-1.5">{quote.items.map((item) => <div key={item.kind} className="flex items-center justify-between gap-4"><span>{labels[item.kind]}</span><span className="tabular-nums">{credits(item.min, item.max)}</span></div>)}</div>
    <p className="text-ink-4 mt-2 leading-relaxed">{zh ? '按当前配置预估，最终按实际用量结算。' : 'Estimate for these settings. Final cost follows actual usage.'}</p>
  </details>;
}
