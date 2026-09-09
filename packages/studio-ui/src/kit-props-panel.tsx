'use client';

/**
 * Typed-props editor — the schema IS the form. Fields are generated from a JSON Schema (closed
 * enums → segmented control, booleans → switch, bounded numbers → slider, colours → swatches +
 * picker + alpha, fonts → the host's picker, row arrays → row list, strings → input/textarea), so
 * new props appear with zero panel work.
 *
 * `PropsForm` is the pure control set; it knows nothing about blocks. Hosts: the kit component
 * wrapper below (schema from the registry) and the component inspector (schema from the unified
 * component contract). Range/colour drags report through `onLive` per input event and commit
 * through `onChange` on release, so a host can paint the preview live and persist once.
 *
 * Visual language matches the other rail panels: no borders — fills (`bg-canvas/70`) separate
 * controls from the panel, a focus ring replaces outlines, selection is a filled pill or a ring.
 */

import { useMemo, type ReactNode } from 'react';
import { kitComponents, kitSurfaceSwatches } from '@pireel/studio-engine/kit-templates';
import type { Block } from '@pireel/studio-engine/composition';
import { Plus, X } from 'lucide-react';
import { t } from './i18n';

export interface FieldSchema {
  type?: string;
  format?: string;
  enum?: string[];
  /** Declared in the component schema: this field only matters while `field` holds one of `in`. */
  showWhen?: { field: string; in: string[] };
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  maxLength?: number;
  description?: string;
  /** Human label (bespoke components declare one per property); falls back to the host's labelOf. */
  title?: string;
  default?: unknown;
  /** Row arrays (kit `rows()`): each row is an object of primitive fields. */
  items?: { properties?: Record<string, FieldSchema>; required?: string[] };
  maxItems?: number;
}

export interface PropsSchema {
  properties?: Record<string, FieldSchema>;
}

/** Field label: catalog key when we have one, else the raw prop name (dev-facing fallback). */
function kitFieldLabel(key: string): string {
  const k = `kitProp.${key}`;
  const label = t(k);
  return label === k ? key : label;
}

const INPUT = 'bg-canvas/70 text-ink placeholder:text-ink-5 focus:ring-ink-4/40 w-full rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:ring-1';
const LABEL = 'text-ink-3 text-[11px]';

function Field({ label, trailing, description, children }: { label: string; trailing?: ReactNode; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5" title={description}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={LABEL}>{label}</span>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-canvas/70'}`}
    >
      <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[left] ${on ? 'left-[16px]' : 'left-[2px]'}`} />
    </button>
  );
}

export function PropsForm({
  schema,
  values,
  onChange,
  onLive,
  labelOf = (key) => key,
  swatches = kitSurfaceSwatches,
  resetMode = 'theme',
  className = 'flex flex-col gap-4',
  renderFont,
}: {
  schema: PropsSchema;
  /** Effective values (defaults already applied by the host). */
  values: Record<string, unknown>;
  /** Commit: the full next values object (the host persists it and owns undo). */
  onChange: (next: Record<string, unknown>) => void;
  /** Live preview while a range/colour input is being dragged; the host paints it without persisting. */
  onLive?: (next: Record<string, unknown>) => void;
  labelOf?: (key: string) => string;
  swatches?: ReadonlyArray<{ name: string; value: string }>;
  /** What the colour "reset" pill means: `theme` = empty string follows the theme token (kit);
   *  `default` = restore the schema default (bespoke components). */
  resetMode?: 'theme' | 'default';
  className?: string;
  /** Host-supplied control for `format:'font'` fields (the font picker lives in the host); absent → plain input. */
  renderFont?: (key: string, value: string, commit: (next: string) => void) => ReactNode;
}) {
  const fields = Object.entries(schema.properties ?? {}).filter(
    ([, f]) =>
      // Row arrays without an object row shape have no control; the rows() shape below gets one.
      (f.type !== 'array' || !!f.items?.properties) &&
      // Dependency declared by the schema, not by this form — a new component that declares one
      // hides correctly with no change here. The value is kept, just not shown.
      (!f.showWhen || f.showWhen.in.includes(String(values[f.showWhen.field] ?? ''))),
  );
  const label = (key: string, f: FieldSchema) => f.title ?? labelOf(key);
  const commit = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  const live = (key: string, v: unknown) => (onLive ?? onChange)({ ...values, [key]: v });

  return (
    <div className={className}>
      {fields.map(([key, f]) => {
        const v = values[key];
        if (f.type === 'array' && f.items?.properties) {
          // Row list: every primitive field of every row is an input; add/remove within maxItems. Rows
          // are content (what the component says), so this is the panel-side twin of canvas text edits.
          const rowsValue = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
          const rowFields = Object.entries(f.items.properties).filter(([, rf]) => rf.type === 'string' || rf.type === 'number');
          const setRows = (rows: Array<Record<string, unknown>>) => commit(key, rows);
          const blankRow = () => Object.fromEntries(rowFields.map(([rk, rf]) => [rk, rf.type === 'number' ? (rf.minimum ?? 0) : '']));
          const canAdd = f.maxItems === undefined || rowsValue.length < f.maxItems;
          return (
            <Field
              key={key}
              label={label(key, f)}
              description={f.description}
              trailing={canAdd && (
                <button type="button" onClick={() => setRows([...rowsValue, blankRow()])} aria-label={t('workbench.propsAddRow')} title={t('workbench.propsAddRow')} className="text-ink-4 hover:text-ink rounded p-0.5">
                  <Plus size={12} />
                </button>
              )}
            >
              <div className="flex flex-col gap-1.5">
                {rowsValue.map((row, index) => (
                  <div key={index} className="bg-canvas/45 group flex items-start gap-1.5 rounded-md p-1.5">
                    <span className="text-ink-5 w-3 shrink-0 pt-1.5 text-center text-[10px] tabular-nums">{index + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {rowFields.map(([rk, rf]) => (
                        <input
                          key={rk}
                          value={row[rk] === undefined || row[rk] === null ? '' : String(row[rk])}
                          placeholder={rf.title ?? labelOf(rk)}
                          maxLength={rf.maxLength}
                          onChange={(e) => {
                            const next = rowsValue.map((r, i) => (i === index ? { ...r, [rk]: rf.type === 'number' ? Number(e.target.value) : e.target.value } : r));
                            setRows(next);
                          }}
                          className={INPUT}
                        />
                      ))}
                    </div>
                    <button type="button" onClick={() => setRows(rowsValue.filter((_, i) => i !== index))} aria-label={t('workbench.propsRemoveRow')} className="text-ink-5 hover:text-ink mt-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </Field>
          );
        }
        if (Array.isArray(f.enum)) {
          return (
            <Field key={key} label={label(key, f)} description={f.description}>
              <div className="bg-canvas/70 flex rounded-md p-0.5">
                {f.enum.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => commit(key, opt)}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-[11px] transition-colors ${
                      v === opt ? 'bg-panel-2 text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>
          );
        }
        if (f.type === 'boolean') {
          return (
            <div key={key} className="flex items-center justify-between gap-2" title={f.description}>
              <span className={LABEL}>{label(key, f)}</span>
              <Switch on={v === true} label={label(key, f)} onToggle={(next) => commit(key, next)} />
            </div>
          );
        }
        if (f.type === 'number') {
          const min = f.minimum ?? 0;
          const max = f.maximum ?? 1;
          const step = f.multipleOf ?? (max - min) / 100;
          const num = typeof v === 'number' ? v : min;
          return (
            <Field key={key} label={label(key, f)} description={f.description} trailing={<span className="text-ink-4 text-[11px] tabular-nums">{Math.round(num * 100) / 100}</span>}>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={num}
                onChange={(e) => live(key, Number(e.target.value))}
                onPointerUp={(e) => commit(key, Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commit(key, Number((e.target as HTMLInputElement).value))}
                onBlur={(e) => commit(key, Number(e.target.value))}
                className="accent-accent h-1.5 w-full cursor-pointer"
              />
            </Field>
          );
        }
        if (f.format === 'font') {
          const val = typeof v === 'string' ? v : String(f.default ?? 'sans');
          return (
            <Field key={key} label={label(key, f)} description={f.description}>
              {renderFont ? renderFont(key, val, (next) => commit(key, next)) : <input value={val} onChange={(e) => commit(key, e.target.value)} className={INPUT} />}
            </Field>
          );
        }
        if (f.format === 'color') {
          // Alpha rides on the same value as #rrggbbaa — a surface over busy footage often wants to
          // let some through — and is only offered once a concrete colour is chosen. `var(--token)`
          // values (bespoke defaults that follow the theme) show no swatch match and no alpha.
          const val = typeof v === 'string' ? v : '';
          const hex = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(val);
          const rgb = hex ? val.slice(0, 7) : '';
          const alpha = hex && val.length === 9 ? Math.round((parseInt(val.slice(7, 9), 16) / 255) * 100) : 100;
          const withAlpha = (hex6: string, a: number) =>
            a >= 100 ? hex6 : hex6 + Math.round((a / 100) * 255).toString(16).padStart(2, '0');
          const resetValue = resetMode === 'theme' ? '' : (f.default ?? '');
          const isReset = resetMode === 'theme' ? !val : val === resetValue;
          const resetTitle = resetMode === 'theme' ? t('kitProp.followTheme') : t('workbench.resetProp');
          const ring = 'ring-accent ring-2 ring-offset-1 ring-offset-panel';
          const swatch = 'h-6 w-6 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)] transition-transform hover:scale-105';
          return (
            <Field
              key={key}
              label={label(key, f)}
              description={f.description}
              trailing={hex && (
                <span className="text-ink-4 flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)]" style={{ background: val }} />
                  {rgb.toUpperCase()}{alpha < 100 ? ` · ${alpha}%` : ''}
                </span>
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => commit(key, resetValue)}
                  title={resetTitle}
                  aria-label={resetTitle}
                  className={`${swatch} bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${isReset ? ring : ''}`}
                />
                {swatches.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    onClick={() => commit(key, withAlpha(sw.value, alpha))}
                    title={sw.name}
                    aria-label={sw.name}
                    className={`${swatch} ${rgb.toLowerCase() === sw.value.toLowerCase() ? ring : ''}`}
                    style={{ background: sw.value }}
                  />
                ))}
                <label
                  title={t('kitProp.customColor')}
                  className={`${swatch} relative cursor-pointer overflow-hidden bg-[conic-gradient(#ff6b5f,#ffd24d,#37d6b0,#4d7cfe,#b89cff,#ff6b5f)]`}
                >
                  <input
                    type="color"
                    value={rgb || '#ffffff'}
                    onInput={(e) => live(key, withAlpha((e.target as HTMLInputElement).value, alpha))}
                    onChange={(e) => commit(key, withAlpha(e.target.value, alpha))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={t('kitProp.customColor')}
                  />
                </label>
              </div>
              {hex && (
                <div className="flex items-center gap-2">
                  <span className="text-ink-4 shrink-0 text-[10px]">{t('kitProp.opacity')}</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={alpha}
                    onChange={(e) => live(key, withAlpha(rgb, Number(e.target.value)))}
                    onPointerUp={(e) => commit(key, withAlpha(rgb, Number((e.target as HTMLInputElement).value)))}
                    onBlur={(e) => commit(key, withAlpha(rgb, Number(e.target.value)))}
                    className="accent-accent h-1.5 min-w-0 flex-1 cursor-pointer"
                  />
                </div>
              )}
            </Field>
          );
        }
        // string
        const long = (f.maxLength ?? 0) >= 60;
        return (
          <Field key={key} label={label(key, f)} description={f.description}>
            {long ? (
              <textarea
                value={typeof v === 'string' ? v : ''}
                maxLength={f.maxLength}
                rows={2}
                onChange={(e) => commit(key, e.target.value)}
                className={`${INPUT} resize-none leading-5`}
              />
            ) : (
              <input
                value={typeof v === 'string' ? v : ''}
                maxLength={f.maxLength}
                onChange={(e) => commit(key, e.target.value)}
                className={INPUT}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Kit block wrapper: schema and defaults from the component registry. */
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
  return (
    // Scroll is each docked panel's own job (the shell is a plain min-h-0 flex row) — without
    // overflow here the fields past the viewport were simply clipped.
    <PropsForm
      schema={def.jsonSchema as PropsSchema}
      values={current}
      onChange={(next) => onPatch({ ...((block.slots as { props?: Record<string, unknown> }).props ?? {}), ...next })}
      labelOf={kitFieldLabel}
      className="flex h-full min-h-0 w-60 flex-col gap-4 overflow-y-auto p-3"
    />
  );
}
