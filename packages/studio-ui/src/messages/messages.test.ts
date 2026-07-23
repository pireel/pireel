/**
 * Message catalog contract: zh is the source of truth, en must mirror it exactly.
 * Guards the failure modes of the slug-key scheme — a translation silently missing
 * (renders zh fallback in en UI) or a placeholder drifting between locales
 * (interpolation breaks in one language only).
 */
import { describe, expect, it } from 'vitest';
import { UI_ZH } from './zh';
import { UI_EN } from './en';
import { EN_ENGINE, ZH_ENGINE } from '@pireel/studio-engine/messages';

const zh = { ...UI_ZH, ...ZH_ENGINE };
const en = { ...UI_EN, ...EN_ENGINE };

describe('message catalogs', () => {
  it('zh and en carry the same key set', () => {
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys.filter((k) => !(k in zh))).toEqual([]);
    expect(zhKeys.filter((k) => !(k in en))).toEqual([]);
  });

  it('keys are namespaced slugs', () => {
    const bad = Object.keys(zh).filter((k) => !/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(k));
    expect(bad).toEqual([]);
  });

  it('placeholders match between locales', () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const drift = Object.keys(zh)
      .filter((k) => k in en)
      .filter((k) => JSON.stringify(holes(zh[k]!)) !== JSON.stringify(holes(en[k]!)))
      .map((k) => `${k}: zh(${holes(zh[k]!)}) vs en(${holes(en[k]!)})`);
    expect(drift).toEqual([]);
  });

  it('no duplicate keys across ui and engine catalogs', () => {
    const uiKeys = new Set(Object.keys(UI_ZH));
    expect(Object.keys(ZH_ENGINE).filter((k) => uiKeys.has(k))).toEqual([]);
  });
});
