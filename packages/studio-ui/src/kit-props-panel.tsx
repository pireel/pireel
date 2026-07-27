'use client';

/**
 * Kit block props editor — the schema IS the form. Fields are generated from the
 * component's JSON Schema (closed enums → pills, booleans → toggle, bounded numbers
 * → slider, strings → input/textarea), so new props/components appear here with
 * zero panel work. Every change patches slots.props; the block re-renders derived.
 */

import { useMemo } from 'react';
import { kitComponents } from '@pireel/studio-engine/kit-templates';
import type { Block } from '@pireel/studio-engine/composition';
import { t } from './i18n';

interface FieldSchema {
  type?: string;
  format?: string;
  enum?: string[];
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
}: {
  block: Block;
  /** Full next props object (caller owns comp update + undo). */
  onPatch: (props: Record<string, unknown>) => void;
}) {
  const cid = block.templateId.slice('kit:'.length);
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
    ([, f]) => f.type !== 'array',
  );

  const set = (key: string, v: unknown) => {
    const raw = ((block.slots as { props?: Record<string, unknown> }).props ?? {}) as Record<string, unknown>;
    onPatch({ ...raw, [key]: v });
  };

  return (
    <div className="flex w-60 flex-col gap-2.5 p-3">
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
          // Empty = follow the theme token, so a theme swap restyles the component; an explicit
          // colour is kept. Both states need to be reachable, hence the reset swatch.
          const val = typeof v === 'string' ? v : '';
          return (
            <div key={key} className="flex items-center justify-between gap-2" title={f.description}>
              <span className="text-ink-4 text-[10px]">{fieldLabel(key)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => set(key, '')}
                  title={t('kitProp.followTheme')}
                  aria-label={t('kitProp.followTheme')}
                  className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!val ? 'border-accent ring-accent ring-1' : 'border-line'}`}
                />
                <label
                  className={`relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border ${val ? 'border-accent ring-accent ring-1' : 'border-line'}`}
                  style={val ? { background: val } : { background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(val) ? val : '#ffffff'}
                    onChange={(e) => set(key, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={fieldLabel(key)}
                  />
                </label>
              </div>
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
