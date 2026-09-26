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
import { groupOf, kitComponents, kitSurfaceSwatches, type PropertyGroup } from '@pireel/studio-engine/kit-templates';
import type { Block } from '@pireel/studio-engine/composition';
import { Plus, X } from 'lucide-react';
import { t } from './i18n';
import { ACCENT_SWATCHES, ColorControl, INK_SWATCHES, OPTION_OFF, OPTION_ON, PROP_INPUT, PropRow, PropSlider } from './prop-controls';

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
  /** Shared property group (registered components carry it); absent → derived from the key/kind. */
  'x-group'?: string;
  /** 'percent' shows a factor as a percentage (1 → 100%). */
  'x-display'?: string;
  default?: unknown;
  /** Row arrays (kit `rows()`): each row is an object of primitive fields. */
  items?: { properties?: Record<string, FieldSchema>; required?: string[] };
  maxItems?: number;
}

export interface PropsSchema {
  properties?: Record<string, FieldSchema>;
}

/** The shared group a field belongs to: declared by registered components, derived otherwise. */
export function propertyGroupOf(key: string, f: FieldSchema): PropertyGroup {
  const declared = f['x-group'];
  return declared === 'layout' || declared === 'content' || declared === 'style' || declared === 'surface' || declared === 'motion'
    ? declared
    : groupOf(key, f);
}

/** Field label: catalog key when we have one, else the raw prop name (dev-facing fallback). */
function kitFieldLabel(key: string): string {
  const k = `kitProp.${key}`;
  const label = t(k);
  return label === k ? key : label;
}

/** An option's words: a component's own layouts are named per component (the same id can mean
 *  different things in two components); shared options (surface, border…) share one name. */
export function kitOptionLabel(key: string, opt: string, componentId?: string): string {
  const slug = opt.replace(/-/g, '_'); // catalog keys are slugs; option ids may be kebab-case
  const keys = [
    ...(key === 'variant' && componentId ? [`kitVariant.${componentId}.${slug}`] : []),
    `kitOpt.${key}.${slug}`,
  ];
  for (const k of keys) {
    const label = t(k);
    if (label !== k) return label;
  }
  const spaced = opt.replace(/[-_]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : opt;
}

/** Shared options drawn by OptionGlyph. */
const GLYPH_FIELDS = new Set(['surface', 'border', 'radius', 'trend']);

/** A tiny drawing of what a shared option does, so the choice reads before its word does. */
function OptionGlyph({ field, opt }: { field: string; opt: string }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const svg = (children: ReactNode) => <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden>{children}</svg>;
  if (field === 'surface') {
    return opt === 'card'
      ? svg(<rect x="2.5" y="3.5" width="11" height="9" rx="2" fill="currentColor" opacity={0.85} />)
      : svg(<rect x="2.5" y="3.5" width="11" height="9" rx="2" {...stroke} strokeDasharray="2 1.6" />);
  }
  if (field === 'border') {
    if (opt === 'none') return svg(<rect x="2.5" y="3.5" width="11" height="9" rx="2" {...stroke} strokeDasharray="2 1.6" opacity={0.6} />);
    return svg(<rect x="2.5" y="3.5" width="11" height="9" rx="2" {...stroke} strokeWidth={opt === 'solid' ? 2.4 : 1} />);
  }
  if (field === 'radius') {
    const r = { sharp: 0, soft: 1.8, round: 3.6, pill: 4.5 }[opt] ?? 2;
    return svg(<rect x="2.5" y="3.5" width="11" height="9" rx={r} {...stroke} />);
  }
  if (field === 'trend') {
    if (opt === 'up') return svg(<path d="M3 11l4-4 2.5 2.5L13 6M10 6h3v3" {...stroke} />);
    if (opt === 'down') return svg(<path d="M3 5l4 4 2.5-2.5L13 10M10 10h3V7" {...stroke} />);
    return svg(<path d="M3 8h10" {...stroke} />);
  }
  return null;
}

const INPUT = PROP_INPUT;
const LABEL = 'text-ink-4 text-[11px]';

/** Label above, control full width — for colour, font, text and row lists. */
function Field({ label, trailing, description, children }: { label: string; trailing?: ReactNode; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5" title={description}>
      {label || trailing ? (
        <div className="flex items-baseline justify-between gap-2">
          <span className={LABEL}>{label}</span>
          {trailing}
        </div>
      ) : null}
      {children}
    </div>
  );
}

const Row = PropRow;

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
  componentId,
  group,
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
  /** Registered component id, for naming its own layouts. */
  componentId?: string;
  /** Render only this group's properties (the host lays the groups out as sections). */
  group?: PropertyGroup;
}) {
  const fields = Object.entries(schema.properties ?? {}).filter(
    ([key, f]) =>
      // Row arrays without an object row shape have no control; the rows() shape below gets one.
      (f.type !== 'array' || !!f.items?.properties) &&
      // Dependency declared by the schema, not by this form — a new component that declares one
      // hides correctly with no change here. The value is kept, just not shown.
      (!f.showWhen || f.showWhen.in.includes(String(values[f.showWhen.field] ?? ''))) &&
      (!group || propertyGroupOf(key, f) === group),
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
                  <div key={index} className="group flex items-start gap-1.5">
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
          const options = f.enum;
          // Layouts are the component's biggest choice: a wrapping set of named tiles, not a
          // squeezed segmented row that truncates past three options.
          const drawn = GLYPH_FIELDS.has(key);
          if (key === 'variant' || (options.length > 3 && !drawn)) {
            return (
              // The layout section's title already names this choice; the tiles stand alone there.
              <Field key={key} label={group === 'layout' && key === 'variant' ? '' : label(key, f)} description={f.description}>
                <div className="grid grid-cols-2 gap-1.5">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => commit(key, opt)}
                      aria-pressed={v === opt}
                      className={`min-w-0 truncate rounded-md px-2.5 py-1.5 text-left text-[11.5px] transition-[background-color,box-shadow,color] ${
                        v === opt ? OPTION_ON : `bg-panel hover:bg-panel-2/70 ${OPTION_OFF}`
                      }`}
                    >
                      {kitOptionLabel(key, opt, componentId)}
                    </button>
                  ))}
                </div>
              </Field>
            );
          }
          return (
            <Row key={key} label={label(key, f)} title={f.description}>
              <div className="bg-panel flex rounded-md p-0.5">
                {options.map((opt) => {
                  const word = kitOptionLabel(key, opt, componentId);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => commit(key, opt)}
                      aria-pressed={v === opt}
                      title={word}
                      className={`flex min-w-0 items-center gap-1 truncate rounded px-2 py-1 text-[11px] transition-colors ${
                        v === opt ? OPTION_ON : OPTION_OFF
                      }`}
                    >
                      <OptionGlyph field={key} opt={opt} />
                      {/* Four drawn options fit the row as drawings; the word rides in the tooltip. */}
                      {drawn && options.length > 3 ? <span className="sr-only">{word}</span> : word}
                    </button>
                  );
                })}
              </div>
            </Row>
          );
        }
        if (f.type === 'boolean') {
          return (
            <Row key={key} label={label(key, f)} title={f.description}>
              <Switch on={v === true} label={label(key, f)} onToggle={(next) => commit(key, next)} />
            </Row>
          );
        }
        if (f.type === 'number') {
          const min = f.minimum ?? 0;
          const max = f.maximum ?? 1;
          const step = f.multipleOf ?? (max - min) / 100;
          const num = typeof v === 'number' ? v : min;
          return (
            <PropSlider
              key={key}
              label={label(key, f)}
              title={f.description}
              value={num}
              min={min}
              max={max}
              step={step}
              display={f['x-display'] === 'percent' ? `${Math.round(num * 100)}%` : String(Math.round(num * 100) / 100)}
              onLive={(next) => live(key, next)}
              onCommit={(next) => commit(key, next)}
            />
          );
        }
        if (f.format === 'font') {
          const val = typeof v === 'string' ? v : String(f.default ?? 'sans');
          return (
            <Field
              key={key}
              label={label(key, f)}
              description={f.description}
              trailing={resetMode === 'theme' && val ? (
                <button type="button" onClick={() => commit(key, '')} className="text-ink-4 hover:text-ink text-[10.5px]">{t('kitProp.followTheme')}</button>
              ) : undefined}
            >
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
          return (
            <ColorControl
              key={key}
              label={label(key, f)}
              title={f.description}
              value={rgb}
              swatches={key === 'accent' ? ACCENT_SWATCHES : key === 'ink' ? INK_SWATCHES : swatches}
              resetLabel={resetMode === 'theme' ? t('kitProp.followTheme') : t('workbench.resetProp')}
              isReset={isReset}
              onReset={() => commit(key, resetValue)}
              onPick={(next) => commit(key, withAlpha(next, alpha))}
              alpha={{ value: alpha, label: t('kitProp.opacity'), onChange: (a) => commit(key, withAlpha(rgb, a)) }}
            />
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
      componentId={cid}
      className="flex h-full min-h-0 w-60 flex-col gap-4 overflow-y-auto p-3"
    />
  );
}
