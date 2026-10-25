/**
 * Lightweight studio i18n core (shared by the engine/editor packages, zero deps):
 *
 * - Slug keys (`t('workbench.noVideoYet')`), catalogs per locale. zh is the authoring
 *   source; en is the FALLBACK locale and must be complete (messages.test.ts enforces
 *   zh/en key parity). Any other locale falls back to en on a miss (then to the key
 *   itself) — never write per-site `locale === 'x'` branches for catalog copy; the
 *   fallback lives here. Misses are collected in `missingKeys` for probes.
 * - Catalogs register per package (registerMessages) — each package's i18n entry module
 *   registers its own zh+en in the module body, so importing `t` triggers registration.
 * - locale is injected by the shell (hosted shell = route $locale; OSS shell sets its
 *   own, default en) — set ONCE before render; no runtime reactivity (switching
 *   language = route change + full-page reload, matching app-router behavior).
 * - Interpolation: `t('captions.linesDone', { done, total })`, {name} placeholders.
 * - The server (Worker) shares module scope across requests, so a global locale is unsafe
 *   there: the server host calls setStudioLocaleSource with the current request's locale.
 *   Server-tools/MCP receipts use tEnglish.
 * - Never call t() at module scope (the shell hasn't injected locale yet): store the
 *   SLUG in constants and wrap with t() at the render/use site.
 */

/** Any BCP-47-ish tag; 'zh' and 'en' ship built-in, additional locales register their own catalogs. */
export type StudioLocale = string;

let locale: StudioLocale = 'zh';
const CATALOGS: Record<string, Record<string, string>> = { zh: {}, en: {} };
/** Keys that missed the active locale's catalog (fell back to zh or the key itself); read by probe/self-check. */
export const missingKeys = new Set<string>();

let source: (() => StudioLocale) | undefined;

export function setStudioLocale(l: StudioLocale): void {
  locale = l;
}
/** Where the locale comes from when it is per request (the server), instead of the global set once. */
export function setStudioLocaleSource(read: (() => StudioLocale) | undefined): void {
  source = read;
}
export function studioLocale(): StudioLocale {
  return source ? source() : locale;
}

/** Each package merges in its own catalogs (called in the package's i18n entry module body; consuming t triggers registration). Any locale tag is accepted — adding a language needs no core change. */
export function registerMessages(l: StudioLocale, dict: Record<string, string>): void {
  Object.assign((CATALOGS[l] ??= {}), dict);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let msg = CATALOGS[studioLocale()]?.[key];
  if (msg === undefined) {
    missingKeys.add(key);
    msg = CATALOGS.en[key] ?? key; // en is the guaranteed-complete fallback locale
  }
  return vars ? msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : msg;
}

/** A name from data that ships its own per-language names (font lists, sound banks, workflow templates),
 *  falling back to English like the catalogs do. UI copy belongs in the catalogs, not in such data. */
export function localized(names: { en: string } & Partial<Record<string, string>>): string {
  return names[studioLocale()] ?? names.en;
}

/** English regardless of the UI locale: tool receipts and error codes read by an agent, which
 *  translates for the user itself; mixing the tab's locale into them produced bilingual receipts. */
export function tEnglish(key: string, vars?: Record<string, string | number>): string {
  const msg = CATALOGS.en[key] ?? key;
  return vars ? msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : msg;
}

import { EN_ENGINE, ZH_ENGINE } from './messages';
registerMessages('zh', ZH_ENGINE);
registerMessages('en', EN_ENGINE);
