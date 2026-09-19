import { useEffect, useMemo, useState } from 'react';
import { studioProviders } from '@pireel/studio-engine/providers';
import { sceneCreditInput, type SceneCreditEstimate } from '@pireel/studio-engine/scene-credit-estimate';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';

export function SceneCreditPreview({ task, options, locale, busy }: { task: CaptionTaskRecord; options: CaptionTaskOptions; locale: 'zh' | 'en'; busy: boolean }) {
  const estimate = studioProviders().estimateSceneCredits;
  const [quote, setQuote] = useState<SceneCreditEstimate | null>(null);
  const [pending, setPending] = useState(true);
  const input = useMemo(() => { try { return JSON.stringify(sceneCreditInput(task, options, false)); } catch { return ''; } }, [task, options]);
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
  const approximate = quote.durationBased || quote.min !== quote.max;
  const point = quote.estimate ?? Math.round((quote.min + quote.max) / 2);
  const displayed = quote.durationBased && point >= 20 ? Math.max(quote.min, Math.min(quote.max, Math.round(point / 5) * 5)) : point;
  const labels = zh ? { visual: '素材分析', matching: '画面匹配', asr: '语音识别', translation: '翻译', emphasis: '重点词', speech: '配音', lipSync: '口型同步' } : { visual: 'Media analysis', matching: 'Footage matching', asr: 'Transcription', translation: 'Translation', emphasis: 'Key phrases', speech: 'Voiceover', lipSync: 'Lip sync' };
  return <details className="text-ink-3 mt-3 text-xs">
    <summary className="cursor-pointer text-center">{zh ? (approximate ? '预计约' : '预计') : (approximate ? 'Estimated ~' : 'Estimated')} <span className="text-ink tabular-nums">{displayed}</span> {zh ? '积分' : 'credits'}</summary>
    <div className="mt-3 space-y-1.5">{quote.items.map((item) => <div key={item.kind} className="flex items-center justify-between gap-4"><span>{labels[item.kind]}</span><span className="tabular-nums">{credits(item.min, item.max)}</span></div>)}</div>
    {quote.min !== quote.max && <p className="text-ink-4 mt-2">{zh ? '估算范围：' : 'Estimated range: '}{credits(quote.min, quote.max)} {zh ? '积分' : 'credits'}</p>}
    <p className="text-ink-4 mt-2 leading-relaxed">{quote.durationBased ? (zh ? '按时长与语速假设估算，文案生成后更新；按实际用量结算。' : 'Budget based on duration and assumed speech rate; updated when the script is ready. Billed by actual usage.') : (zh ? '按当前配置预估，最终按实际用量结算。' : 'Estimate for these settings. Final cost follows actual usage.')}</p>
  </details>;
}
