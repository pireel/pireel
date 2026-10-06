import { WEB_FONTS, searchFonts, webFontFontId } from './font-library';

/**
 * The method's font step: a vision model looks at crops of the creator's text — burned-in captions, the
 * titles and labels they add, their cover lettering — describes each typeface, names what it most
 * likely is, and picks the closest face the platform can render. Chinese faces are picked from the
 * fonts the platform has (system sans / serif and the CJK library); a Latin face named by the model is
 * looked up in the whole Google Fonts snapshot. Choosing is the model's; checking the id is code's.
 */

export type FontRole = 'captions' | 'titles' | 'cover';
export const FONT_ROLES: readonly FontRole[] = ['captions', 'titles', 'cover'];

/** Faces the platform renders for Chinese text, with how they look, for the model to choose among. */
export function cjkFontChoices(): { id: string; name: string; look: string }[] {
  return [
    { id: 'sans', name: '思源黑体 Source Han Sans / Noto Sans SC', look: 'standard modern sans (黑体), regular to bold' },
    { id: 'serif', name: '思源宋体 Source Han Serif / Noto Serif SC', look: 'standard Song / Ming serif (宋体)' },
    ...WEB_FONTS.map(font => ({ id: webFontFontId(font), name: `${font.label.zh} ${font.family}`, look: font.category })),
  ];
}

export interface FontReading {
  /** The face to render with: an id from the choices, or google:<Family> for a Latin face. */
  id: string;
  /** What the model takes the face to be ("方正兰亭特黑", "Montserrat ExtraBold"). */
  actual?: string;
  /** The look in words: class, weight, width, slant, details. */
  look: string;
  weight?: 'light' | 'regular' | 'bold' | 'black';
}

export function fontsSystemPrompt(): string {
  const choices = cjkFontChoices().map(choice => `- ${choice.id}: ${choice.name} (${choice.look})`).join('\n');
  return `You identify the typefaces a creator uses in their videos, from crops of their text. The crops are labelled by role:
- captions: the burned-in subtitles of the speech;
- titles: words the creator puts straight on the picture besides captions — headlines, labels, emphasis words (not words inside charts or cards);
- cover: the lettering on their video covers.

A crop can catch text that belongs to the filmed scene — signs, book spines, packaging, clothing, a screen in the room — instead of words added in editing; such text is not the creator's typeface: leave that role out when all its crops are scene text.

For each role that has creator-added text, report:
- look: the typeface in a few words — class (黑体 sans, 圆体 rounded, 宋体 serif, 楷体/手写 handwriting, 毛笔 brush, 综艺/美术 display), weight, width (condensed, normal, wide), slant, and what makes it recognisable; leave out colour, stroke and shadow (they are measured elsewhere);
- actual: the font you believe it is, by name, when you can tell ("思源黑体 Heavy", "方正兰亭特黑", "Montserrat ExtraBold"); omit when you cannot;
- weight: light, regular, bold or black;
- id: the face the platform should render it with —
  for Chinese text, the closest one of these:
${choices}
  for Latin-only text, "google:<Family>" with the Google Fonts family closest to it (for example google:Montserrat, google:Anton, google:Bebas Neue).
Pick by shape first (class, width, slant, stroke ends), weight second.

Return only JSON: {"captions":{"look":"…","actual":"…","weight":"…","id":"…"},"titles":{…},"cover":{…}} — only the roles that have creator-added text.`;
}

/** The readings, each id checked: a CJK choice as given, a google:<Family> that exists (else the closest
 *  family by name), anything else dropped with the role listed in `unknown`. */
export function parseFonts(raw: string): { fonts: Partial<Record<FontRole, FontReading>>; unknown: FontRole[] } {
  let value: Record<string, unknown>;
  try { value = JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? raw) as Record<string, unknown>; } catch { throw new Error(`品牌提取输出不符合约定：fonts = ${raw.slice(0, 160)}`); }
  const cjk = new Set(cjkFontChoices().map(choice => choice.id));
  const fonts: Partial<Record<FontRole, FontReading>> = {}; const unknown: FontRole[] = [];
  for (const role of FONT_ROLES) {
    const item = value[role] as Record<string, unknown> | undefined;
    if (!item || typeof item !== 'object') continue;
    const look = typeof item.look === 'string' ? item.look.trim().slice(0, 300) : '';
    const given = typeof item.id === 'string' ? item.id.trim() : '';
    const id = cjk.has(given) ? given : given.startsWith('google:') ? googleFamily(given.slice(7)) : null;
    if (!id || !look) { unknown.push(role); continue; }
    const actual = typeof item.actual === 'string' && item.actual.trim() ? item.actual.trim().slice(0, 80) : undefined;
    const weight = ['light', 'regular', 'bold', 'black'].includes(item.weight as string) ? item.weight as FontReading['weight'] : undefined;
    fonts[role] = { id, look, ...(actual ? { actual } : {}), ...(weight ? { weight } : {}) };
  }
  return { fonts, unknown };
}

/** google:<Family> for a family in the snapshot, matched by name (case and spacing aside). */
function googleFamily(name: string): string | null {
  const needle = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return null;
  const hit = searchFonts(needle, { script: 'latin', limit: 10 }).find(found => found.source === 'google' && found.family.toLowerCase() === needle);
  return hit ? hit.id : null;
}
