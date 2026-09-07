/**
 * Web font library — CJK display ("花字") faces served from the CDN.
 *
 * System fonts are body faces, and Latin display fonts carry no Han glyphs, so a montage title in
 * "Impact" silently falls back to the default CJK face for every Chinese character. The library
 * fixes both: a curated set of free-for-commercial-use Chinese display fonts, split into
 * unicode-range chunks (cn-font-split) so a page only fetches the glyph blocks it renders, and a
 * default CJK PARTNER appended after any Latin-only local font so one choice covers both scripts.
 *
 * Files live at `${base}/<id>/result.css` (+ hashed .woff2 chunks); scripts/upload-fonts.ts
 * publishes them. Font ids are persisted as `web:<id>` in caption/display-text styles.
 */

import { googleFontCssUrl, googleFontRowOf, searchGoogleFonts, type FontSearchHit, type FontSearchOptions } from './google-fonts';

export interface WebFont {
  id: string;
  /** CSS font-family name baked into the split CSS. */
  family: string;
  label: { zh: string; en: string };
  /** Source + license, for the picker's attribution and for audits. */
  license: 'OFL' | 'free-commercial';
  source: string;
}

export const WEB_FONTS: readonly WebFont[] = [
  { id: 'smiley-sans', family: 'Smiley Sans', label: { zh: '得意黑', en: 'Smiley Sans' }, license: 'OFL', source: 'atelier-anchor/smiley-sans' },
  { id: 'ximaiti', family: 'Ximaiti', label: { zh: '喜脉体', en: 'Ximaiti' }, license: 'free-commercial', source: '字制区喜脉体 (公益字体)' },
  { id: 'zcool-kuaile', family: 'ZCOOL KuaiLe', label: { zh: '站酷快乐体', en: 'ZCOOL KuaiLe' }, license: 'OFL', source: 'google/fonts ofl/zcoolkuaile' },
  { id: 'zcool-xiaowei', family: 'ZCOOL XiaoWei', label: { zh: '站酷小薇 LOGO 体', en: 'ZCOOL XiaoWei' }, license: 'OFL', source: 'google/fonts ofl/zcoolxiaowei' },
  { id: 'zcool-qingke-huangyou', family: 'ZCOOL QingKe HuangYou', label: { zh: '站酷庆科黄油体', en: 'ZCOOL QingKe HuangYou' }, license: 'OFL', source: 'google/fonts ofl/zcoolqingkehuangyou' },
  { id: 'lxgw-wenkai', family: 'LXGW WenKai', label: { zh: '霞鹜文楷', en: 'LXGW WenKai' }, license: 'OFL', source: 'lxgw/LxgwWenKai' },
  { id: 'ma-shan-zheng', family: 'Ma Shan Zheng', label: { zh: '马善政毛笔楷书', en: 'Ma Shan Zheng' }, license: 'OFL', source: 'google/fonts ofl/mashanzheng' },
  { id: 'zhi-mang-xing', family: 'Zhi Mang Xing', label: { zh: '志莽行书', en: 'Zhi Mang Xing' }, license: 'OFL', source: 'google/fonts ofl/zhimangxing' },
  { id: 'long-cang', family: 'Long Cang', label: { zh: '龙藏体', en: 'Long Cang' }, license: 'OFL', source: 'google/fonts ofl/longcang' },
  { id: 'liu-jian-mao-cao', family: 'Liu Jian Mao Cao', label: { zh: '刘建毛草', en: 'Liu Jian Mao Cao' }, license: 'OFL', source: 'google/fonts ofl/liujianmaocao' },
  { id: 'douyin-sans', family: 'Douyin Sans', label: { zh: '抖音美好体', en: 'Douyin Sans' }, license: 'OFL', source: 'bytedance/fonts DouyinSans' },
  { id: 'qingsong-handwriting-1', family: 'Qingsong Handwriting 1', label: { zh: '清松手写体1', en: 'Qingsong Handwriting 1' }, license: 'OFL', source: 'jasonhandwriting/JasonHandwriting' },
  { id: 'xiangcui-zero-hei', family: 'Xiangcui Zero Hei', label: { zh: '香萃零度黑', en: 'Xiangcui Zero Hei' }, license: 'OFL', source: 'Miiiller/Xiangcui-ZeroHei' },
  { id: 'xiangcui-jixue-song', family: 'Xiangcui Jixue Song', label: { zh: '香萃积雪宋', en: 'Xiangcui Jixue Song' }, license: 'OFL', source: 'Miiiller/Xiangcui-Jixuesong' },
  { id: 'huxiaobo-nanshen', family: 'Huxiaobo Nanshen Ti', label: { zh: '胡晓波男神体', en: 'Huxiaobo Nanshen Ti' }, license: 'free-commercial', source: '胡晓波 (作者声明永久免费商用)' },
  { id: 'honglei-zhuoshu', family: 'Honglei Zhuoshu', label: { zh: '鸿雷拙书简体', en: 'Honglei Zhuoshu' }, license: 'free-commercial', source: '鸿雷字迹 (作者声明免费商用)' },
  { id: 'alimama-fangyuan', family: 'Alimama FangYuan Ti', label: { zh: '阿里妈妈方圆体', en: 'Alimama FangYuan Ti' }, license: 'free-commercial', source: '阿里妈妈 © Alimama (永久免费商用, 需标注版权所有人)' },
];

/** The CJK face paired behind a Latin-only local font, so Han glyphs stop falling back to the system body face. */
export const DEFAULT_CJK_PARTNER_ID = 'smiley-sans';

const WEB_FONT_PREFIX = 'web:';
const DEFAULT_WEB_FONT_BASE = 'https://cdn.pireel.com/fonts';
let webFontBase = DEFAULT_WEB_FONT_BASE;

/** Shell hook: serve the library from another base (same layout: `<base>/<id>/result.css`). */
export function setWebFontBase(base: string): void {
  webFontBase = (base || DEFAULT_WEB_FONT_BASE).replace(/\/+$/, '');
}

export function webFontIdOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(WEB_FONT_PREFIX)) return null;
  const id = value.slice(WEB_FONT_PREFIX.length);
  return WEB_FONTS.some((font) => font.id === id) ? id : null;
}

export function webFontById(id: string): WebFont | null {
  return WEB_FONTS.find((font) => font.id === id) ?? null;
}

export function webFontFontId(font: WebFont): `web:${string}` {
  return `${WEB_FONT_PREFIX}${font.id}`;
}

/** Agent-facing catalog rows (get_state.fonts): the id every text surface accepts plus both labels,
 *  so tool descriptions can state the id grammar once instead of enumerating the library. */
export function webFontCatalog(): Array<{ id: `web:${string}`; zh: string; en: string }> {
  return WEB_FONTS.map((font) => ({ id: webFontFontId(font), zh: font.label.zh, en: font.label.en }));
}

export function webFontCssUrl(id: string): string {
  return `${webFontBase}/${id}/result.css`;
}

const quoteFamily = (family: string) => `"${family.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** CSS font-family stack for a web font id (`web:<id>`); null when not a library font. */
export function webFontFamilyCss(value: unknown): string | null {
  const id = webFontIdOf(value);
  const font = id ? webFontById(id) : null;
  return font ? `${quoteFamily(font.family)},sans-serif` : null;
}

/** Partner stack appended behind a Latin-only face: `"<local family>","Smiley Sans",sans-serif`. */
export function cjkPartnerFamilyCss(): string {
  const partner = webFontById(DEFAULT_CJK_PARTNER_ID)!;
  return quoteFamily(partner.family);
}

/** Stylesheet URLs a document must load to render the given font ids (web fonts, plus the CJK
 * partner whenever a local font is in play). Deduplicated, stable order. */
export function webFontStylesheetUrls(fontIds: ReadonlyArray<unknown>): string[] {
  const ids = new Set<string>();
  const google = new Map<string, string>();
  for (const value of fontIds) {
    const id = webFontIdOf(value);
    const row = id ? null : googleFontRowOf(value);
    if (id) ids.add(id);
    else if (row) {
      // A Google face renders with the CJK partner behind it, exactly like a local face.
      google.set(row.f, googleFontCssUrl(row));
      ids.add(DEFAULT_CJK_PARTNER_ID);
    } else if (typeof value === 'string' && value.startsWith('local:')) ids.add(DEFAULT_CJK_PARTNER_ID);
  }
  return [...[...ids].map(webFontCssUrl), ...google.values()];
}

/** The stylesheet one font id needs (library chunked CSS or the Google css2 request); null for builtin/local ids. */
export function fontStylesheetUrlFor(value: unknown): string | null {
  const id = webFontIdOf(value);
  if (id) return webFontCssUrl(id);
  const row = googleFontRowOf(value);
  return row ? googleFontCssUrl(row) : null;
}

/** Combined font search: library faces first (matched on id, family, zh/en label), then the Google
 *  snapshot ranked by popularity. `script` narrows to faces that carry that writing system; every
 *  library face is CJK. */
export function searchFonts(query: string, options: FontSearchOptions = {}): FontSearchHit[] {
  const needle = query.trim().toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);
  const library: FontSearchHit[] = [];
  if (!options.script || options.script === 'zh-Hans' || options.script === 'zh-Hant' || options.script === 'latin') {
    for (const font of WEB_FONTS) {
      const hay = [font.id, font.family, font.label.zh, font.label.en].join(' ').toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      library.push({ id: webFontFontId(font), family: font.family, label: font.label.zh, source: 'library', scripts: ['latin', 'zh-Hans'] });
    }
  }
  if (options.category) library.length = 0; // categories are a Google notion; library faces are display faces
  return [...library, ...searchGoogleFonts(query, { ...options, limit })].slice(0, limit);
}

/** `web:<anything the user calls it>` → `web:<id>`: the id, the CSS family, or a zh/en label
 * (case-insensitive). An agent that only knows the font by its display name should not have to
 * guess the slug. Null when nothing in the library matches. */
export function resolveWebFontReference(value: unknown): `web:${string}` | null {
  if (typeof value !== 'string' || !value.startsWith('web:')) return null;
  const needle = value.slice(4).trim().toLowerCase();
  if (!needle) return null;
  const hit = WEB_FONTS.find((font) => (
    font.id.toLowerCase() === needle
    || font.family.toLowerCase() === needle
    || font.label.zh.toLowerCase() === needle
    || font.label.en.toLowerCase() === needle
  ));
  return hit ? webFontFontId(hit) : null;
}

/** One line per library font for error messages: `web:lxgw-wenkai (霞鹜文楷 / LXGW WenKai)`. */
export function webFontCatalogHint(): string {
  return WEB_FONTS.map((font) => `web:${font.id} (${font.label.zh} / ${font.label.en})`).join(', ');
}
