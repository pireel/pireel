import { ERASURE_TIERS } from '@pireel/studio-engine/erasure-pricing';
import { useEffect, useMemo, useState } from 'react';
import { studioProviders } from '@pireel/studio-engine/providers';
import { sceneCreditInput, type SceneCreditEstimate } from '@pireel/studio-engine/scene-credit-estimate';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';

export function SceneCreditPreview({ task, options, locale, busy }: { task: CaptionTaskRecord; options: CaptionTaskOptions; locale: 'zh' | 'en'; busy: boolean }) {
  const estimate = studioProviders().estimateSceneCredits;
  const [quote, setQuote] = useState<SceneCreditEstimate | null>(null);
  const [pending, setPending] = useState(true);
  const input = useMemo(() => { try { return JSON.stringify(sceneCreditInput(task, options, task.scene === 'sfx')); } catch { return ''; } }, [task, options]);
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
  if (quote.erasure) {
    const price = quote.erasure; const tier = ERASURE_TIERS.find(item => item.id === price.tier)!;
    return <div role="status" className="text-ink-3 mt-4 space-y-2 border-t border-line pt-4 text-xs leading-relaxed">
      <p className="text-ink text-sm">{tier[locale]} · {zh ? '预计预扣' : 'Estimated precharge'} <strong className="tabular-nums">{price.prechargeCredits}</strong> {zh ? '积分' : 'credits'}</p>
      <p>{zh ? `本档基础成本 ¥${price.baseCnyPerMinute}/分钟；当前视频按输出上限估算约 ¥${price.costCny.toFixed(3)}。` : `Base cost: CNY ${price.baseCnyPerMinute}/min. Estimated cost for this video: CNY ${price.costCny.toFixed(3)}.`}</p>
      <p>{zh ? `按成本价收取，不加服务费。1 积分按 ¥${price.cnyPerCredit} 换算，整单向上取整。完成后按实际输出时长、帧率和分辨率结算，差额退回。` : `Charged at cost with no service markup. One credit = CNY ${price.cnyPerCredit}; the order rounds up once. Final output duration, frame rate and resolution determine settlement; excess credits are refunded.`}</p>
      <p className="text-ink-4">{zh ? '输出最高 1080p、30fps；较小输入不放大，高帧率输入会降至 30fps。' : 'Output up to 1080p and 30fps. Smaller videos are not upscaled; higher frame rates are reduced to 30fps.'}</p>
    </div>;
  }
  if (quote.fixed) {
    const { perMinute, lipSync } = quote.fixed;
    const name = task.scene === 'dubbing' ? { zh: '配音', en: 'Dubbing' } : task.scene === 'sfx' ? { zh: '音效', en: 'Auto SFX' } : { zh: '字幕', en: 'Captions' };
    return <div role="status" className="text-ink-3 mt-3 space-y-1.5 text-center text-xs leading-relaxed">
      <p>{zh ? '本次生成' : 'This generation'} <strong className="text-ink tabular-nums">{quote.estimate}</strong> {zh ? '积分' : 'credits'}</p>
      <p className="text-ink-4">{zh
        ? `${name.zh}按视频时长 ${perMinute} 积分/分钟${lipSync ? `，口型同步 ${lipSync.perMinute} 积分/分钟（不足 ${lipSync.minSec} 秒按 ${lipSync.minSec} 秒计）` : ''}`
        : `${name.en}: ${perMinute} credit${perMinute === 1 ? '' : 's'} per minute of video${lipSync ? `; lip sync: ${lipSync.perMinute} per minute (minimum ${lipSync.minSec} seconds)` : ''}.`}</p>
    </div>;
  }
  const approximate = quote.durationBased || quote.min !== quote.max;
  const point = quote.estimate ?? Math.round((quote.min + quote.max) / 2);
  const displayed = quote.durationBased && point >= 20 ? Math.max(quote.min, Math.min(quote.max, Math.round(point / 5) * 5)) : point;
  const labels = zh ? { subtitleRemoval: '智能擦除', visual: '素材分析', sfx: zh ? 'AI 音效匹配' : 'AI sound matching', matching: '画面匹配', asr: '语音识别', translation: '翻译', emphasis: '重点词', speech: '配音', lipSync: '口型同步' } : { subtitleRemoval: 'AI erasing', visual: 'Media analysis', sfx: zh ? 'AI 音效匹配' : 'AI sound matching', matching: 'Footage matching', asr: 'Transcription', translation: 'Translation', emphasis: 'Key phrases', speech: 'Voiceover', lipSync: 'Lip sync' };
  return <details className="text-ink-3 mt-3 text-xs">
    <summary className="cursor-pointer text-center">{zh ? (approximate ? '预计约' : '预计') : (approximate ? 'Estimated ~' : 'Estimated')} <span className="text-ink tabular-nums">{displayed}</span> {zh ? '积分' : 'credits'}</summary>
    <div className="mt-3 space-y-1.5">{quote.items.map((item) => <div key={item.kind} className="flex items-center justify-between gap-4"><span>{labels[item.kind]}</span><span className="tabular-nums">{credits(item.min, item.max)}</span></div>)}</div>
    {quote.min !== quote.max && <p className="text-ink-4 mt-2">{zh ? '估算范围：' : 'Estimated range: '}{credits(quote.min, quote.max)} {zh ? '积分' : 'credits'}</p>}
    <p className="text-ink-4 mt-2 leading-relaxed">{quote.durationBased ? (zh ? '按时长与语速假设估算，文案生成后更新；按实际用量结算。' : 'Budget based on duration and assumed speech rate; updated when the script is ready. Billed by actual usage.') : (zh ? '按当前配置预估，最终按实际用量结算。' : 'Estimate for these settings. Final cost follows actual usage.')}</p>
  </details>;
}
