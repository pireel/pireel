import type { AsrSegment } from './build-blocks';
import { readyUgcAdOptions, type UgcAdOptions } from './ugc-ad';

export interface UgcAdText { role: 'hook' | 'claim' | 'cta'; text: string; startSec: number; durationSec: number }
const tidy = (text: string) => text.replace(/\s+/gu, ' ').trim();
/** Keep the user's exact commercial facts. The opener is either supplied or quoted from the source narration. */
export function planUgcAdText(options: UgcAdOptions, transcript: readonly AsrSegment[], durationSec: number): UgcAdText[] {
  const brief = readyUgcAdOptions(options);
  if (!Number.isFinite(durationSec) || durationSec < 3) throw new Error('UGC 广告视频至少需要 3 秒。');
  const spoken = transcript.filter(row => row.text.trim() && row.start >= 0 && row.start < Math.min(durationSec, 8));
  const preferred = brief.angle === 'problem' ? spoken.find(row => /[?？]|为什么|怎么|难|烦|problem|why|how/i.test(row.text))
    : brief.angle === 'review' ? spoken.find(row => /我|用过|体验|觉得|I |my |tried|review/i.test(row.text))
    : spoken.find(row => row.text.includes(brief.productName)) ?? spoken[0];
  const sourceOpening = preferred?.text?.trim();
  const opening = tidy(brief.hook || (sourceOpening && [...sourceOpening].length <= 80 ? sourceOpening : brief.productName));
  const firstLength = Math.min(2.8, Math.max(.8, durationSec * .24));
  const ctaLength = Math.min(3, Math.max(.8, durationSec * .24));
  const ctaStart = Math.max(firstLength + .2, durationSec - ctaLength);
  const items: UgcAdText[] = [{ role: 'hook', text: opening, startSec: 0, durationSec: firstLength }];
  if (brief.claim && ctaStart - firstLength >= 1.2) {
    const available = ctaStart - firstLength;
    items.push({ role: 'claim', text: tidy(brief.claim), startSec: firstLength + .2, durationSec: Math.min(2.8, available - .4) });
  }
  items.push({ role: 'cta', text: tidy(brief.callToAction), startSec: ctaStart, durationSec: durationSec - ctaStart });
  return items;
}
