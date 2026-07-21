/**
 * Google Fonts → 内联 @font-face(base64 data:)。
 *
 * foreignObject SVG 当 <img> 光栅化时不允许加载任何外部资源,字体必须以 data: URI 内嵌。
 * Noto Sans SC 全量 4 字重 ≈ 15-20MB(base64 后更大),每帧拼进 SVG 字符串不可接受 →
 * 按「实际用到的码点 ∩ 各子集的 unicode-range」只内嵌命中的子集(CJK 常见就几个,~几百 KB)。
 * 结果字符串整次导出缓存复用。
 */

export interface FontFace {
  family: string;
  style: string;
  weight: string;
  /** unicode-range 解析成 [start, end] 列表;无声明 = null(全量保留)。 */
  ranges: [number, number][] | null;
  url: string;
}

/** assembleHtml head 里那条 Google Fonts link 的等价 css2 请求(与 assemble 的 STUDIO_FONTS_HREF 同步维护)。 */
export const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&family=IBM+Plex+Mono:wght@500;600&display=swap';

function parseRange(spec: string): [number, number] | null {
  const s = spec.trim().toUpperCase();
  // U+4E00-9FFF / U+2000 / U+4??(通配)
  const m = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/.exec(s);
  if (!m) return null;
  if (m[1].includes('?')) {
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = parseInt(m[1].replace(/\?/g, 'F'), 16);
    return [lo, hi];
  }
  const lo = parseInt(m[1], 16);
  return [lo, m[2] ? parseInt(m[2], 16) : lo];
}

export function parseFontFaces(css: string): FontFace[] {
  const faces: FontFace[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
    const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
    if (!family || !url) continue;
    const style = /font-style:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? 'normal';
    const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? '400';
    const rangeDecl = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    const ranges = rangeDecl
      ? (rangeDecl.split(',').map(parseRange).filter(Boolean) as [number, number][])
      : null;
    faces.push({ family, style, weight, ranges, url });
  }
  return faces;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * 构建内联字体 CSS:抓 css2 → 过滤命中 usedText 码点的子集 → 逐个抓 woff2 转 base64。
 * 返回可直接塞进 SVG <style> 的 @font-face 串。
 */
export async function buildInlineFontCss(
  usedText: string,
  log: (m: string) => void = () => {},
): Promise<string> {
  const t0 = performance.now();
  // 精确子集:text= 让 Google 服务端按字符裁字形(CJK 每子集几百 KB → 全部合计几十 KB)。
  // 内联串是每个变动帧 SVG data URI 的一部分,体积直接乘在逐帧解析成本上。
  // 大小写都收(CSS text-transform 会要走 textContent 里没有的另一半字形);
  // 字符集过大(URL 上限)或请求失败 → 回落 unicode-range 命中法(旧行为)。
  const uniq = [...new Set([...(usedText + usedText.toUpperCase() + usedText.toLowerCase())])].join('');
  let res: Response | null = null;
  if (uniq.length > 0 && uniq.length <= 600) {
    res = await fetch(`${FONT_CSS_URL}&text=${encodeURIComponent(uniq)}`).catch(() => null);
    if (res?.ok) log(`字体精确子集:${uniq.length} 字符`);
    else res = null;
  }
  if (!res) res = await fetch(FONT_CSS_URL);
  if (!res.ok) throw new Error(`fonts css ${res.status}`);
  const faces = parseFontFaces(await res.text());

  const used = new Set<number>();
  for (const ch of usedText) used.add(ch.codePointAt(0)!);
  const hit = (f: FontFace) =>
    !f.ranges || f.ranges.some(([lo, hi]) => { for (const cp of used) if (cp >= lo && cp <= hi) return true; return false; });

  const kept = faces.filter(hit);
  log(`字体子集:${faces.length} 个 @font-face 命中 ${kept.length} 个`);

  const parts = await Promise.all(
    kept.map(async (f) => {
      const buf = await (await fetch(f.url)).arrayBuffer();
      const range = f.ranges ? `unicode-range:${f.ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(',')};` : '';
      return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');${range}}`;
    }),
  );
  const css = parts.join('\n');
  log(`字体内联完成:${(css.length / 1024 / 1024).toFixed(2)}MB css · ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  return css;
}
