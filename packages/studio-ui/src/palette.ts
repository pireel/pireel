'use client';

/**
 * 底色派生 —— 从缩略帧采样,派生「轻度融入」调色板:一个从画面取的 accent + 给面板/发丝线/网格
 * 微染画面色温。结构/正文颜色不动(保持中性高可读)。输出 = 覆盖 #root 颜色 vars(键不含 --)。
 * 纯客户端 canvas 采样,确定性(同帧同结果);washed/灰画面退回从平均色温取 accent。
 */

import type { Thumbnail } from '@pireel/studio-engine/video-edit/types';

export type DerivedPalette = Record<string, string>;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return [h, s, l];
}

/** 从缩略帧采样 → 派生 palette(覆盖 accent/panel/panel-2/line/grid)。失败/无帧返回 null(用主题默认)。 */
export async function extractPalette(thumbs: Thumbnail[]): Promise<DerivedPalette | null> {
  if (!thumbs.length || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  try {
    const W = 28;
    const H = 50;
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    let rs = 0;
    let gs = 0;
    let bs = 0;
    let n = 0;
    const hueWeight = new Array(12).fill(0); // 饱和度加权的色相直方图(只计鲜艳像素)

    for (const th of thumbs) {
      let bm: ImageBitmap;
      try {
        bm = await createImageBitmap(th.blob);
      } catch {
        continue;
      }
      ctx.drawImage(bm, 0, 0, W, H);
      bm.close();
      const d = ctx.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        rs += r;
        gs += g;
        bs += b;
        n++;
        const [h, s, l] = rgbToHsl(r, g, b);
        if (s > 0.28 && l > 0.18 && l < 0.86) hueWeight[Math.min(11, Math.floor(h / 30))] += s;
      }
    }
    if (!n) return null;

    const [tintH] = rgbToHsl(rs / n, gs / n, bs / n); // 平均色 → 色温
    const th = Math.round(tintH);

    // accent:最强鲜艳色相 bin 的中心;画面太灰(无鲜艳)→ 退回从色温取
    let best = -1;
    let bestV = 0;
    for (let i = 0; i < 12; i++) {
      if (hueWeight[i] > bestV) {
        bestV = hueWeight[i];
        best = i;
      }
    }
    const accent = best >= 0 ? `hsl(${best * 30 + 15} 64% 50%)` : `hsl(${th} 52% 48%)`;

    return {
      accent,
      panel: `hsl(${th} 14% 97%)`,
      'panel-2': `hsl(${th} 12% 92%)`,
      line: `hsl(${th} 24% 26% / 0.16)`,
      grid: `hsl(${th} 24% 26% / 0.08)`,
    };
  } catch {
    return null;
  }
}
