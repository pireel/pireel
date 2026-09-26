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

import { useMemo, useState, type ReactNode } from 'react';
import { groupOf, kitComponents, kitSurfaceSwatches, type PropertyGroup } from '@pireel/studio-engine/kit-templates';
import type { Block } from '@pireel/studio-engine/composition';
import { GripVertical, Plus, X } from 'lucide-react';
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
  /** Kept for stored props, not offered by editors. */
  'x-hidden'?: boolean;
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
const GLYPH_FIELDS = new Set(['surface', 'border', 'radius', 'trend', 'mark']);

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
  if (field === 'mark') {
    if (opt === 'check') return svg(<><rect x="2" y="2" width="12" height="12" rx="3" {...stroke} /><path d="M5 8.2l2 2L11 6" {...stroke} strokeWidth={1.7} /></>);
    if (opt === 'cross') return svg(<><rect x="2" y="2" width="12" height="12" rx="3" {...stroke} /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" {...stroke} strokeWidth={1.7} /></>);
    return svg(<rect x="2" y="2" width="12" height="12" rx="3" {...stroke} />);
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

/** An editable list of rows: inputs per text/number field, an icon toggle per small enum (cycles on
 *  click), a drag handle to reorder, add within maxItems and remove on hover. */
function RowList({
  label,
  description,
  field,
  rows,
  labelOf,
  componentId,
  onChange,
}: {
  label: string;
  description?: string;
  field: FieldSchema;
  rows: Array<Record<string, unknown>>;
  labelOf: (key: string) => string;
  componentId?: string;
  onChange: (next: Array<Record<string, unknown>>) => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const props = Object.entries(field.items?.properties ?? {});
  const inputs = props.filter(([, rf]) => (rf.type === 'string' || rf.type === 'number') && !Array.isArray(rf.enum));
  const toggles = props.filter(([, rf]) => Array.isArray(rf.enum) && rf.enum.length <= 4);
  const blankRow = () => Object.fromEntries([
    ...inputs.map(([rk, rf]) => [rk, rf.type === 'number' ? (rf.minimum ?? 0) : '']),
    ...toggles.map(([rk, rf]) => [rk, rf.default ?? rf.enum![0]]),
  ]);
  const canAdd = field.maxItems === undefined || rows.length < field.maxItems;
  const setRow = (index: number, patch: Record<string, unknown>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const move = (from: number, to: number) => {
    if (from === to || from + 1 === to) return;
    const next = [...rows];
    const [picked] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, picked!);
    onChange(next);
  };
  return (
    <Field
      label={label}
      description={description}
      trailing={canAdd && (
        <button type="button" onClick={() => onChange([...rows, blankRow()])} aria-label={t('workbench.propsAddRow')} title={t('workbench.propsAddRow')} className="text-ink-4 hover:text-ink rounded p-0.5">
          <Plus size={12} />
        </button>
      )}
    >
      <div className="flex flex-col" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}>
        {rows.map((row, index) => (
          <div
            key={index}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < r.top + r.height / 2 ? index : index + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dropAt !== null) move(dragFrom, dropAt);
              setDragFrom(null);
              setDropAt(null);
            }}
            className={`group relative flex items-center gap-1 py-[3px] ${dragFrom === index ? 'opacity-40' : ''}`}
          >
            {dropAt === index && <span className="bg-ink-3 absolute -top-px left-5 right-5 h-0.5 rounded-full" />}
            {dropAt === rows.length && index === rows.length - 1 && <span className="bg-ink-3 absolute -bottom-px left-5 right-5 h-0.5 rounded-full" />}
            <span
              draggable
              onDragStart={(e) => { setDragFrom(index); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); }}
              onDragEnd={() => { setDragFrom(null); setDropAt(null); }}
              title={t('workbench.propsDragRow')}
              className="text-ink-4 hover:text-ink flex h-8 w-4 shrink-0 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            >
              <GripVertical size={12} />
            </span>
            {toggles.map(([rk, rf]) => {
              const options = rf.enum!;
              const current = typeof row[rk] === 'string' && options.includes(row[rk] as string) ? (row[rk] as string) : String(rf.default ?? options[0]);
              const next = options[(options.indexOf(current) + 1) % options.length]!;
              const word = kitOptionLabel(rk, current, componentId);
              return (
                <button
                  key={rk}
                  type="button"
                  onClick={() => setRow(index, { [rk]: next })}
                  title={`${word} → ${kitOptionLabel(rk, next, componentId)}`}
                  aria-label={word}
                  className={`hover:bg-panel-2/70 flex h-8 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${current === 'none' ? 'text-ink-4' : 'text-ink'}`}
                >
                  {GLYPH_FIELDS.has(rk) ? <OptionGlyph field={rk} opt={current} /> : <span className="text-[10.5px]">{word}</span>}
                </button>
              );
            })}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {inputs.map(([rk, rf]) => (
                <input
                  key={rk}
                  value={row[rk] === undefined || row[rk] === null ? '' : String(row[rk])}
                  placeholder={rf.title ?? labelOf(rk)}
                  maxLength={rf.maxLength}
                  onChange={(e) => setRow(index, { [rk]: rf.type === 'number' ? Number(e.target.value) : e.target.value })}
                  className={INPUT}
                />
              ))}
            </div>
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={t('workbench.propsRemoveRow')} className="text-ink-4 hover:text-ink shrink-0 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </Field>
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
  themeColors,
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
  /** What theme-following colours resolve to, keyed by property (accent, ink, surfaceColor…). */
  themeColors?: Record<string, string>;
}) {
  const fields = Object.entries(schema.properties ?? {}).filter(
    ([key, f]) =>
      // Row arrays without an object row shape have no control; the rows() shape below gets one.
      (f.type !== 'array' || !!f.items?.properties) &&
      // Dependency declared by the schema, not by this form — a new component that declares one
      // hides correctly with no change here. The value is kept, just not shown.
      (!f.showWhen || f.showWhen.in.includes(String(values[f.showWhen.field] ?? ''))) &&
      (!group || propertyGroupOf(key, f) === group) &&
      // Stored props keep legacy fields; editors don't offer them (their meaning moved elsewhere).
      !f['x-hidden'],
  );
  const label = (key: string, f: FieldSchema) => f.title ?? labelOf(key);
  const commit = (key: string, v: unknown) => onChange({ ...values, [key]: v });
  const live = (key: string, v: unknown) => (onLive ?? onChange)({ ...values, [key]: v });

  return (
    <div className={className}>
      {fields.map(([key, f]) => {
        const v = values[key];
        if (f.type === 'array' && f.items?.properties) {
          // Row list: rows are content (what the component says), so this is the panel-side twin of
          // canvas text edits. Text/number fields are inputs; a small enum (an item's mark) is an icon
          // that cycles; rows reorder by dragging their handle.
          return (
            <RowList
              key={key}
              label={label(key, f)}
              description={f.description}
              field={f}
              rows={Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []}
              labelOf={labelOf}
              componentId={componentId}
              onChange={(next) => commit(key, next)}
            />
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
              {...(resetMode === 'theme' && themeColors?.[key] ? { follows: themeColors[key] } : {})}
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
