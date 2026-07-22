/**
 * Lightweight studio i18n core (shared by the engine/editor packages, zero deps):
 *
 * - Chinese string IS the key: source keeps the Chinese original (single source
 *   of truth); the en dictionary maps zh→en, falling back to Chinese on a miss so
 *   the UI never breaks. Dictionaries register per package (registerEnMessages),
 *   maintained in separate files.
 * - locale is injected by the shell (hosted shell = route $locale; OSS shell sets
 *   its own, default en) — set ONCE before render; no runtime reactivity
 *   (switching language = route change + full-page reload, matching app-router behavior).
 * - Interpolation: `t('已铺 {n} 条', { n })`, {name} placeholders.
 * - Client-side UI strings ONLY: the server (Worker) has cross-request shared
 *   module scope where this global locale is unsafe — server-tools/MCP receipts
 *   don't go through here.
 * - Never call t() at module scope (the shell hasn't injected locale yet): store
 *   Chinese in constants and wrap at the render/use site.
 */

export type StudioLocale = 'zh' | 'en';

let locale: StudioLocale = 'zh';
const EN: Record<string, string> = {};
/** Collects missing en keys (read by probe/self-check, doesn't spam the console). */
export const missingEn = new Set<string>();

export function setStudioLocale(l: StudioLocale): void {
  locale = l;
}
export function studioLocale(): StudioLocale {
  return locale;
}

/** Each package merges in its own en dictionary (called in the package's i18n entry module body; consuming t triggers registration). */
export function registerEnMessages(dict: Record<string, string>): void {
  Object.assign(EN, dict);
}

export function t(zh: string, vars?: Record<string, string | number>): string {
  let msg = zh;
  if (locale === 'en') {
    const hit = EN[zh];
    if (hit !== undefined) msg = hit;
    else missingEn.add(zh);
  }
  return vars ? msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : msg;
}

import { EN_ENGINE } from './messages-en';
registerEnMessages(EN_ENGINE);
