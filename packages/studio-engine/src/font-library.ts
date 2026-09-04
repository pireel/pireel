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
  for (const value of fontIds) {
    const id = webFontIdOf(value);
    if (id) ids.add(id);
    else if (typeof value === 'string' && value.startsWith('local:')) ids.add(DEFAULT_CJK_PARTNER_ID);
  }
  return [...ids].map(webFontCssUrl);
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
