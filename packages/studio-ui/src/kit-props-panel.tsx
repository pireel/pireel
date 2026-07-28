'use client';

/**
 * Kit block props editor — the schema IS the form. Fields are generated from the
 * component's JSON Schema (closed enums → pills, booleans → toggle, bounded numbers
 * → slider, strings → input/textarea), so new props/components appear here with
 * zero panel work. Every change patches slots.props; the block re-renders derived.
 */

import { useMemo } from 'react';
import { kitComponents, kitSurfaceFields, kitSurfaceSwatches } from '@pireel/studio-engine/kit-templates';
import { componentBlueprints } from '@pireel/studio-engine/blueprint-registry';
import type { Block } from '@pireel/studio-engine/composition';
import { useFrameCatalog } from './use-frame-catalog';
import { t } from './i18n';

interface FieldSchema {
  type?: string;
  format?: string;
  enum?: string[];
  /** Declared in the component schema: this field only matters while `field` holds one of `in`. */
  showWhen?: { field: string; in: string[] };
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  description?: string;
}

/** Field label: catalog key when we have one, else the raw prop name (dev-facing fallback). */
function fieldLabel(key: string): string {
  const k = `kitProp.${key}`;
  const label = t(k);
  return label === k ? key : label;
}

export function KitPropsPanel({
  block,
  onPatch,
  onSetStaging,
}: {
  block: Block;
  /** Full next props object (caller owns comp update + undo). */
  onPatch: (props: Record<string, unknown>) => void;
  /** Switch which theme's look this block wears (undefined = the component's built-in variant).
   *  The row lists EVERY theme that stages this component — not just the attached one: a block may
   *  borrow any theme's look. Row hidden when no theme stages the component (nothing to choose). */
  onSetStaging?: (blueprintId: string | undefined) => void;
}) {
  const cid = block.templateId.slice('kit:'.length);
  const catalog = useFrameCatalog();
  const stagings = useMemo(() => {
    const list = componentBlueprints(cid);
    // Per-frame counts first, so a theme with several looks for one component labels each.
    const perFrame = new Map<string, number>();
    for (const b of list) {
      const fid = b.id.split('/')[0]!;
      perFrame.set(fid, (perFrame.get(fid) ?? 0) + 1);
    }
    return list.map((b) => {
      const fid = b.id.split('/')[0]!;
      const title = catalog.find((f) => f.id === fid)?.title ?? fid;
      return { id: b.id, label: (perFrame.get(fid) ?? 0) > 1 ? `${title} · ${b.name}` : title };
    });
  }, [cid, catalog]);
  const currentStaging = typeof (block.slots as { blueprintId?: unknown }).blueprintId === 'string' ? String((block.slots as { blueprintId?: unknown }).blueprintId) : undefined;
  const def = (kitComponents as Record<string, { jsonSchema: Record<string, unknown>; defaults: Record<string, unknown> }>)[cid];
  const current = useMemo(
    () => ({ ...(def?.defaults ?? {}), ...((block.slots as { props?: Record<string, unknown> }).props ?? {}) }),
    [def, block.slots],
  );
  if (!def) return null;
  // Row-array props (chart series, kpi cells, steps items) have no control yet — a text input
  // would stringify and destroy the data on first keystroke. Content for those is edited on the
  // canvas or via the agent until a row editor exists.
  const fields = Object.entries((def.jsonSchema as { properties?: Record<string, FieldSchema> }).properties ?? {}).filter(
    ([key, f]) =>
      f.type !== 'array' &&
      // While a staging is active it paints its own surface — the surface knobs would do nothing,
      // so they step aside (values are kept; they return when the staging comes off).
      !(currentStaging && key in kitSurfaceFields) &&
      // Dependency declared by the schema, not by this panel — a new component that declares one
      // hides correctly with no change here. The value is kept, just not shown.
      (!f.showWhen || f.showWhen.in.includes(String(current[f.showWhen.field] ?? ''))),
  );

  const set = (key: string, v: unknown) => {
    const raw = ((block.slots as { props?: Record<string, unknown> }).props ?? {}) as Record<string, unknown>;
    onPatch({ ...raw, [key]: v });
  };

  return (
    <div className="flex w-60 flex-col gap-2.5 p-3">
      {onSetStaging && stagings.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-ink-4 text-[10px]">{t('kitProp.staging')}</span>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onSetStaging(undefined)}
              className={`rounded border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                !currentStaging ? 'border-accent text-accent bg-accent/5' : 'border-line text-ink-3 hover:text-ink'
              }`}
            >
              {t('kitProp.stagingBuiltIn')}
            </button>
            {stagings.map((bp) => (
              <button
                key={bp.id}
                type="button"
                onClick={() => onSetStaging(bp.id)}
                className={`rounded border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                  currentStaging === bp.id ? 'border-accent text-accent bg-accent/5' : 'border-line text-ink-3 hover:text-ink'
                }`}
              >
                {bp.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {fields.map(([key, f]) => {
        const v = current[key];
        if (Array.isArray(f.enum)) {
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-ink-4 text-[10px]" title={f.description}>{fieldLabel(key)}</span>
              <div className="flex flex-wrap gap-1">
                {f.enum.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(key, opt)}
                    className={`rounded border px-1.5 py-0.5 text-[10.5px] transition-colors ${
                      v === opt ? 'border-accent text-accent bg-accent/5' : 'border-line text-ink-3 hover:text-ink'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        if (f.type === 'boolean') {
          return (
            <label key={key} className="flex items-center justify-between gap-2" title={f.description}>
              <span className="text-ink-4 text-[10px]">{fieldLabel(key)}</span>
              <input type="checkbox" checked={v === true} onChange={(e) => set(key, e.target.checked)} className="accent-accent h-3.5 w-3.5" />
            </label>
          );
        }
        if (f.type === 'number') {
          const min = f.minimum ?? 0;
          const max = f.maximum ?? 1;
          return (
            <div key={key} className="flex flex-col gap-1" title={f.description}>
              <span className="text-ink-4 text-[10px]">
                {fieldLabel(key)} · {typeof v === 'number' ? v : min}
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={(max - min) / 100}
                value={typeof v === 'number' ? v : min}
                onChange={(e) => set(key, Number(e.target.value))}
                className="accent-accent"
              />
            </div>
          );
        }
        if (f.format === 'color') {
          // Empty = follow the theme token (a theme swap restyles the component); an explicit
          // colour survives it. Alpha rides on the same value as #rrggbbaa — a surface over busy
          // footage often wants to let some through — and is only offered once a colour is chosen.
          const val = typeof v === 'string' ? v : '';
          const rgb = val.slice(0, 7);
          const alpha = val.length === 9 ? Math.round((parseInt(val.slice(7, 9), 16) / 255) * 100) : 100;
          const withAlpha = (hex6: string, a: number) =>
            a >= 100 ? hex6 : hex6 + Math.round((a / 100) * 255).toString(16).padStart(2, '0');
          return (
            <div key={key} className="flex flex-col gap-1.5" title={f.description}>
              <span className="text-ink-4 text-[10px]">{fieldLabel(key)}</span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => set(key, '')}
                  title={t('kitProp.followTheme')}
                  aria-label={t('kitProp.followTheme')}
                  className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!val ? 'border-accent ring-accent ring-1' : 'border-line'}`}
                />
                {kitSurfaceSwatches.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    onClick={() => set(key, withAlpha(sw.value, alpha))}
                    title={sw.name}
                    aria-label={sw.name}
                    className={`h-5 w-5 shrink-0 rounded-full border ${rgb.toLowerCase() === sw.value.toLowerCase() ? 'border-accent ring-accent ring-1' : 'border-line'}`}
                    style={{ background: sw.value }}
                  />
                ))}
                <label
                  title={t('kitProp.customColor')}
                  className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                  style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(rgb) ? rgb : '#ffffff'}
                    onChange={(e) => set(key, withAlpha(e.target.value, alpha))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t('kitProp.customColor')}
                  />
                </label>
              </div>
              {val && (
                <label className="flex items-center gap-1.5">
                  <span className="text-ink-4 shrink-0 text-[10px]">
                    {t('kitProp.opacity')} {alpha}%
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={alpha}
                    onChange={(e) => set(key, withAlpha(rgb, Number(e.target.value)))}
                    className="accent-accent min-w-0 flex-1"
                  />
                </label>
              )}
            </div>
          );
        }
        // string
        const long = (f.maxLength ?? 0) >= 60;
        return (
          <div key={key} className="flex flex-col gap-1" title={f.description}>
            <span className="text-ink-4 text-[10px]">{fieldLabel(key)}</span>
            {long ? (
              <textarea
                value={typeof v === 'string' ? v : ''}
                maxLength={f.maxLength}
                rows={2}
                onChange={(e) => set(key, e.target.value)}
                className="border-line bg-panel text-ink focus:border-accent resize-none rounded border px-1.5 py-1 text-[11.5px] outline-none"
              />
            ) : (
              <input
                value={typeof v === 'string' ? v : ''}
                maxLength={f.maxLength}
                onChange={(e) => set(key, e.target.value)}
                className="border-line bg-panel text-ink focus:border-accent rounded border px-1.5 py-1 text-[11.5px] outline-none"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
