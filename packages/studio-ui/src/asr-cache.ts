/**
 * 口播 ASR 结果持久缓存(localStorage,按视频 URL)。
 * 同一条口播后面会反复用——转写一次,之后导入/刷新/再来都秒回,不重复烧 ASR。
 */

import type { AsrSegment } from '@pireel/studio-engine/build-blocks';

const PREFIX = 'pinshot:studio:asr:';

export function getCachedAsr(url: string): AsrSegment[] | null {
  if (!url || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + url);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as AsrSegment[]) : null;
  } catch {
    return null;
  }
}

export function setCachedAsr(url: string, segs: AsrSegment[]): void {
  if (!url || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PREFIX + url, JSON.stringify(segs));
  } catch {
    // 配额满 / 隐私模式:静默降级(内存里仍有)
  }
}
