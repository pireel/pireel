import { cjkPartnerFamilyCss, webFontFamilyCss, webFontIdOf } from './font-library';
/** Deterministic native display-text vocabulary shared by tools, renderer and future preset UI. */
export const DISPLAY_TEXT_PRESET_IDS = [
  'clean',
  'editorial',
  'headline',
  'outline',
  'marker',
  'label',
] as const;

export type DisplayTextPresetId = (typeof DISPLAY_TEXT_PRESET_IDS)[number];

/** Kept intentionally small and semantic. These mirror the native text motion set of mainstream editors. */
export const DISPLAY_TEXT_ANIMATION_IDS = [
  'none',
  'popIn',
  'slideUp',
  'typewriter',
  'wordReveal',
  'wordSlide',
  'highlightPop',
  'highlightBlock',
] as const;

export type DisplayTextAnimationId = (typeof DISPLAY_TEXT_ANIMATION_IDS)[number];

export const DISPLAY_TEXT_FONT_IDS = [
  'preset',
  'sans',
  'serif',
  'mono',
] as const;

export type BuiltInDisplayTextFontId = (typeof DISPLAY_TEXT_FONT_IDS)[number];
export type DisplayTextFontId = BuiltInDisplayTextFontId | `local:${string}` | `web:${string}`;

const DISPLAY_TEXT_FONT_CSS: Record<BuiltInDisplayTextFontId, string | null> = {
  preset: null,
  sans: '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
  serif: '"Noto Serif SC","Songti SC",STSong,serif',
  mono: '"IBM Plex Mono","Noto Sans SC",ui-monospace,monospace',
};

export interface DisplayTextPreset {
  id: DisplayTextPresetId;
  label: string;
  description: string;
  defaultAnimation: DisplayTextAnimationId;
}

/** Product-facing catalog. The ids are persisted; labels can be localized when a picker is added. */
export const DISPLAY_TEXT_PRESETS: readonly DisplayTextPreset[] = [
  { id: 'clean', label: '清爽白字', description: '简洁高对比，适合补充说明与短句。', defaultAnimation: 'slideUp' },
  { id: 'editorial', label: '杂志衬线', description: '克制的编辑感，适合观点与情绪句。', defaultAnimation: 'wordReveal' },
  { id: 'headline', label: '强力标题', description: '粗重紧凑，适合钩子、结论与 CTA。', defaultAnimation: 'popIn' },
  { id: 'outline', label: '描边大字', description: '保留画面穿透感，适合强调关键词。', defaultAnimation: 'wordSlide' },
  { id: 'marker', label: '荧光标记', description: '重点词带强调底色，适合证据与卖点。', defaultAnimation: 'highlightPop' },
  { id: 'label', label: '编辑标签', description: '紧凑色块标签，适合章节、地点与属性。', defaultAnimation: 'highlightBlock' },
] as const;

export const DEFAULT_DISPLAY_TEXT_PRESET: DisplayTextPresetId = 'clean';

export function isDisplayTextPresetId(value: unknown): value is DisplayTextPresetId {
  return typeof value === 'string' && (DISPLAY_TEXT_PRESET_IDS as readonly string[]).includes(value);
}

export function isDisplayTextAnimationId(value: unknown): value is DisplayTextAnimationId {
  return typeof value === 'string' && (DISPLAY_TEXT_ANIMATION_IDS as readonly string[]).includes(value);
}

export function isDisplayTextFontId(value: unknown): value is DisplayTextFontId {
  return typeof value === 'string' && (
    (DISPLAY_TEXT_FONT_IDS as readonly string[]).includes(value)
    || displayTextLocalFontFamily(value) !== null
    || webFontIdOf(value) !== null
  );
}

export function displayTextFontCss(value: unknown): string | null {
  const web = webFontFamilyCss(value);
  if (web) return web;
  const localFamily = displayTextLocalFontFamily(value);
  // A local (usually Latin-only) face gets the CJK display partner behind it, so Han glyphs
  // render in a matching display face instead of falling back to the system body font.
  if (localFamily) return `"${localFamily.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}",${cjkPartnerFamilyCss()},sans-serif`;
  const builtin = (DISPLAY_TEXT_FONT_IDS as readonly string[]).includes(String(value))
    ? value as BuiltInDisplayTextFontId
    : 'preset';
  return DISPLAY_TEXT_FONT_CSS[builtin];
}

function hasUnsafeFontFamilyChars(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function localDisplayTextFontId(family: string): DisplayTextFontId | null {
  const normalized = family.trim();
  if (!normalized || normalized.length > 160 || hasUnsafeFontFamilyChars(normalized)) return null;
  return `local:${encodeURIComponent(normalized)}`;
}

export function displayTextLocalFontFamily(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('local:')) return null;
  try {
    const family = decodeURIComponent(value.slice(6)).trim();
    return family && family.length <= 160 && !hasUnsafeFontFamilyChars(family) ? family : null;
  } catch {
    return null;
  }
}

export function displayTextPreset(id: unknown): DisplayTextPreset {
  const wanted = isDisplayTextPresetId(id) ? id : DEFAULT_DISPLAY_TEXT_PRESET;
  return DISPLAY_TEXT_PRESETS.find((preset) => preset.id === wanted)!;
}
