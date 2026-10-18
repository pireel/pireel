'use client';

/**
 * Inspector for a component (registered or bespoke): everything the user can change without
 * regenerating it, in a contextual docked panel shown when a component is selected.
 *
 *  - Properties: the unified component contract (component-schema.ts) rendered by PropsForm;
 *    bespoke drags paint the preview live, release commits one undo step; registered components
 *    re-render on commit.
 *  - Text: every data-edit element of bespoke markup is a text field; committing writes through the
 *    same path the canvas double-click uses, so both stay one value.
 *  - Images: every <img> slot of bespoke markup with its thumbnail; replace/remove go through the
 *    existing slot path.
 *
 * Layout: a labelled header anchors the panel, then hairline-separated groups of rows (label left,
 * control right for compact controls; stacked for text / colour / images). Structure comes from the
 * dividers and the header, not from boxes — so the panel reads as an editor, not an empty page.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { Block } from '@pireel/studio-engine/composition';
import type { DisplayTextFontId } from '@pireel/studio-engine/composition';
import { dataEditFields, imageSlots } from '@pireel/studio-engine/component-props';
import { componentSchemaOf } from '@pireel/studio-engine/component-schema';
import { lookPieceOf, type DocumentLook } from '@pireel/studio-engine/look';
import { ImageIcon, RefreshCw, Shapes, Trash2 } from 'lucide-react';
import type { Block as EditorBlock } from '@pireel/studio-engine/composition';
import { liveMessageFor } from './component-props-ui';
import { FontPicker } from './display-text-panel';
import { PropsForm, propertyGroupOf, type PropsSchema } from './kit-props-panel';
import { ColorControl, PROP_INPUT, PropSlider } from './prop-controls';
import { PROPERTY_GROUPS, type PropertyGroup } from '@pireel/studio-engine/kit-templates';
import { t } from './i18n';
import {
  cachedLocalFontFamilies,
  loadLocalFontFamilies,
  supportsLocalFontAccess,
  type LocalFontFamilyOption,
} from './local-font-access';

/** Whole-block fields the inspector edits besides the component's own properties. */
export interface InspectorBlockPatch {
  startSec?: number;
  durationSec?: number;
  block?: Partial<Pick<EditorBlock, 'box' | 'scale' | 'rotation' | 'opacity' | 'bg' | 'border' | 'radius' | 'label' | 'motion'>>;
}

export interface ComponentPropsPanelProps {
  block: Block | null;
  /** The output's look: a look instance's properties are declared by its piece there. */
  look?: DocumentLook;
  /** Canvas size, for showing the box in percent and radius in px. */
  canvas: { width: number; height: number };
  /** Background / border swatches (theme paper and panel first). */
  swatches: ReadonlyArray<{ label: string; value: string }>;
  /** Resolved theme colours (accent, fg, panel, line) — what "follow theme" shows. */
  themeVars?: Record<string, string>;
  /** Commit a geometry / timing / appearance / label change (one undo step, no regeneration). */
  onBlockPatch: (patch: InspectorBlockPatch) => void;
  /** Commit the form's next values (registered or bespoke — the engine knows where they persist). */
  onValues: (next: Record<string, unknown>) => void;
  onLive: (message: { vars: Record<string, string>; attrs: Record<string, string> }) => void;
  onText: (key: string, value: string) => void;
  onReplaceImage: (index: number) => void;
  onRemoveImage: (index: number) => void;
}

/** Author-chosen data-edit / prop keys are code tokens (`headline`, `cta-label`); show them as words. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

const FIELD = PROP_INPUT;

/** A hairline-topped group of rows. `first` drops the divider so the panel doesn't open on a line. */
function Group({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <section className="px-3.5">
      <div className={`text-ink-2 flex items-center gap-2 pb-2.5 text-[11.5px] font-semibold ${first ? 'pt-1.5' : 'border-line mt-2 border-t pt-3.5'}`}>
        {label}
      </div>
      <div className="flex flex-col gap-2.5 pb-1.5">{children}</div>
    </section>
  );
}

/** Label above, control full width — for text, colour swatch rows and the name. */
function Stack({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label ? <span className="text-ink-4 truncate text-[11px]">{label}</span> : null}
      {children}
    </label>
  );
}

function TextField({ label, text, onCommit }: { label?: string; text: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);
  const commit = () => { if (draft !== text) onCommit(draft); };
  return (
    <Stack label={label}>
      <textarea
        value={draft}
        rows={draft.length > 24 ? 2 : 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        className={`${FIELD} resize-none`}
      />
    </Stack>
  );
}

/** The component's name, edited in place in the header: reads as a title until hovered or focused. */
function NameField({ name, placeholder, onCommit }: { name: string; placeholder: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={t('workbench.propsName')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== name) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(name); (e.target as HTMLInputElement).blur(); } }}
      className="text-ink placeholder:text-ink hover:bg-panel focus:bg-panel w-full truncate rounded-md bg-transparent px-1 py-0.5 text-[13px] font-semibold leading-tight outline-none transition-colors"
    />
  );
}

function Slider({ label, value, min, max, step, display, onCommit }: { label: string; value: number; min: number; max: number; step: number; display: string; onCommit: (next: number) => void }) {
  return <PropSlider label={label} value={value} min={min} max={max} step={step} display={display} onCommit={onCommit} />;
}

/** A block-level colour (frame background / outline) in the shared one-row colour control. */
function ColorRow({ label, value, swatches, noneTitle, onCommit }: { label: string; value: string | undefined; swatches: ReadonlyArray<{ label: string; value: string }>; noneTitle: string; onCommit: (next: string | undefined) => void }) {
  return (
    <ColorControl
      label={label}
      value={/^#[0-9a-fA-F]{6}/.test(value ?? '') ? value! : ''}
      swatches={swatches.map((sw) => ({ name: sw.label, value: sw.value }))}
      resetLabel={noneTitle}
      isReset={!value}
      onReset={() => onCommit(undefined)}
      onPick={(next) => onCommit(next)}
    />
  );
}

/** Theme tokens → the shared colour properties that follow them when left empty. */
function themeColorsOf(vars: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!vars) return undefined;
  const pick = (k: string) => (vars[k] && !vars[k]!.startsWith('var(') ? vars[k]! : undefined);
  const out: Record<string, string> = {};
  for (const [prop, token] of [['accent', 'accent'], ['ink', 'fg'], ['surfaceColor', 'panel'], ['borderColor', 'line']] as const) {
    const v = pick(token);
    if (v) out[prop] = v;
  }
  return out;
}

const GROUP_LABEL: Record<PropertyGroup, string> = {
  layout: 'workbench.propsGroupLayout',
  content: 'workbench.propsGroupContent',
  style: 'workbench.propsGroupStyle',
  surface: 'workbench.propsGroupSurface',
  motion: 'workbench.propsGroupMotion',
};

/** Style, surface and motion back to the component's defaults; layout and content stay as written. */
function resetStyle(schema: PropsSchema, values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  for (const [key, f] of Object.entries(schema.properties ?? {})) {
    const group = propertyGroupOf(key, f);
    if (group === 'style' || group === 'surface' || group === 'motion') next[key] = f.default ?? '';
  }
  return next;
}

/** Merge one motion field, dropping defaults so an untouched component stores nothing. */
function motionPatch(current: EditorBlock['motion'], change: { speed?: number; delaySec?: number }): EditorBlock['motion'] {
  const next = { ...current, ...change };
  const speed = next.speed && next.speed !== 1 ? next.speed : undefined;
  const delaySec = next.delaySec && next.delaySec > 0 ? Math.round(next.delaySec * 10) / 10 : undefined;
  return speed || delaySec ? { ...(speed ? { speed } : {}), ...(delaySec ? { delaySec } : {}) } : undefined;
}

function Empty({ text }: { text: string }) {
  return <div data-block-selection-keep className="text-ink-4 flex h-full items-center justify-center px-6 text-center text-[11px] leading-5">{text}</div>;
}

export function ComponentPropsPanel({ block, look, swatches, themeVars, onBlockPatch, onValues, onLive, onText, onReplaceImage, onRemoveImage }: ComponentPropsPanelProps) {
  const [localFonts, setLocalFonts] = useState<LocalFontFamilyOption[]>(cachedLocalFontFamilies);
  const [fontAccessState, setFontAccessState] = useState<'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported'>('idle');
  const requestLocalFonts = async () => {
    if (!supportsLocalFontAccess()) { setFontAccessState('unsupported'); return; }
    setFontAccessState('loading');
    try { setLocalFonts(await loadLocalFontFamilies()); setFontAccessState('loaded'); } catch { setFontAccessState('denied'); }
  };

  const view = block ? componentSchemaOf(block, look) : null;
  const pieceId = block ? lookPieceOf(block.templateId) : null;
  if (!block || (block.templateId !== 'custom' && !pieceId && !view)) return <Empty text={t('workbench.propsSelectHint')} />;
  // Text and image slots belong to bespoke markup; registered components carry their text in schema rows.
  const innerHtml = block.templateId === 'custom' && typeof block.slots.innerHtml === 'string' ? block.slots.innerHtml : '';
  const texts = dataEditFields(innerHtml);
  const images = imageSlots(innerHtml);
  const isCustom = block.templateId === 'custom';
  // What kind of component this is, under its name: a look instance names its piece.
  const kindLabel = pieceId
    ? t('workbench.componentHeaderLook', { piece: look?.pieces[pieceId]?.label ?? pieceId })
    : isCustom ? t('workbench.componentHeaderCustom') : t('workbench.componentHeaderKit');
  const headerName = block.label?.trim() || kindLabel;
  const schemaFields = Object.entries(((view?.schema as PropsSchema | undefined)?.properties) ?? {});
  const groupsWithFields = new Set(schemaFields.filter(([, f]) => !f['x-hidden']).map(([key, f]) => propertyGroupOf(key, f)));
  // Fixed order; a section shows when the component has something in it. Every component takes
  // opacity (style) and motion timing; the block-frame surface stands in only for bespoke markup —
  // a registered component's surface is whatever it declares (none for a code window).
  const sections = PROPERTY_GROUPS.filter((group) =>
    group === 'style' || group === 'motion' || groupsWithFields.has(group) || (group === 'surface' && isCustom) || (group === 'content' && texts.length > 0),
  );
  const form = (group: PropertyGroup) => view && (
    <PropsForm
      schema={view.schema as PropsSchema}
      values={view.values}
      group={group}
      themeColors={themeColorsOf(themeVars)}
      className="flex flex-col gap-2.5"
      resetMode={view.source === 'kit' ? 'theme' : 'default'}
      {...(view.source === 'kit' && block.templateId.startsWith('kit:') ? { componentId: block.templateId.slice(4) } : {})}
      labelOf={(key) => { const k = `kitProp.${key}`; const l = t(k); return l === k ? humanizeKey(key) : l; }}
      onLive={view.source === 'manifest' ? (next) => { const message = liveMessageFor(block, next); if (message) onLive(message); } : undefined}
      onChange={onValues}
      renderFont={(_key, value, commit) => (
        <FontPicker
          value={(value || 'preset') as DisplayTextFontId}
          localFonts={localFonts}
          accessState={fontAccessState}
          onChoose={(font) => commit(font)}
          onLoadMore={() => void requestLocalFonts()}
          {...(value ? {} : { defaultLabel: t('kitProp.followTheme') })}
        />
      )}
    />
  );

  return (
    // Clicking inside the inspector must not clear the selection it edits (the workbench treats any
    // host-UI region without this marker as "blank page → deselect").
    <div data-block-selection-keep className="flex h-full min-h-0 flex-col overflow-y-auto py-1">
      <div className="flex items-center gap-2.5 px-3 pt-2 pb-1">
        <div className="bg-accent/12 text-accent-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Shapes size={15} />
        </div>
        <div className="min-w-0 flex-1">
          {/* The name edits in place; placement and timing are edited on the canvas and timeline. */}
          <NameField name={block.label ?? ''} placeholder={headerName} onCommit={(label) => onBlockPatch({ block: { label: label.trim() || undefined } })} />
          <div className="text-ink-4 truncate px-1 text-[10.5px]">{kindLabel}</div>
        </div>
      </div>

      {/* One panel for every component: the same sections in the same order. A component fills
          the sections it has; the placement, timing and motion rows are every component's. */}
      {sections.map((group, index) => (
        <Group key={group} label={t(GROUP_LABEL[group])} first={index === 0}>
          {group === 'content' && texts.map((field) => (
            <TextField key={field.key} label={humanizeKey(field.key)} text={field.text} onCommit={(value) => onText(field.key, value)} />
          ))}
          {view && groupsWithFields.has(group) && form(group)}
          {group === 'style' && (
            <Slider label={t('workbench.propsOpacity')} value={Math.round((block.opacity ?? 1) * 100)} min={5} max={100} step={5} display={`${Math.round((block.opacity ?? 1) * 100)}%`} onCommit={(v) => onBlockPatch({ block: { opacity: v >= 100 ? undefined : v / 100 } })} />
          )}
          {group === 'surface' && !groupsWithFields.has('surface') && (
            // A bespoke component has no panel properties of its own: its surface is the block frame.
            <>
              <ColorRow label={t('workbench.propsBackground')} value={block.bg} swatches={swatches} noneTitle={t('workbench.noBackground')} onCommit={(bg) => onBlockPatch({ block: { bg } })} />
              <ColorRow label={t('workbench.propsBorder')} value={block.border} swatches={swatches} noneTitle={t('workbench.propsNoBorder')} onCommit={(border) => onBlockPatch({ block: { border } })} />
              <Slider label={t('workbench.propsRadius')} value={block.radius ?? 0} min={0} max={160} step={2} display={`${block.radius ?? 0} px`} onCommit={(v) => onBlockPatch({ block: { radius: v > 0 ? v : undefined } })} />
            </>
          )}
          {group === 'motion' && (
            <>
              <Slider label={t('workbench.propsMotionSpeed')} value={block.motion?.speed ?? 1} min={0.25} max={3} step={0.25} display={`${block.motion?.speed ?? 1}×`}
                onCommit={(speed) => onBlockPatch({ block: { motion: motionPatch(block.motion, { speed }) } })} />
              <Slider label={t('workbench.propsMotionDelay')} value={block.motion?.delaySec ?? 0} min={0} max={Math.max(0.1, Math.min(5, block.durationSec - 0.1))} step={0.1} display={`${(block.motion?.delaySec ?? 0).toFixed(1)}s`}
                onCommit={(delaySec) => onBlockPatch({ block: { motion: motionPatch(block.motion, { delaySec }) } })} />
            </>
          )}
        </Group>
      ))}

      {images.length > 0 && (
        <Group label={t('workbench.propsImages')}>
          {images.map((img) => (
            <div key={img.index} className="group flex items-center gap-2.5">
              <div className="bg-panel-2 flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md shadow-[inset_0_0_0_1px_var(--color-line-2)]">
                {img.src ? <img src={img.src} alt={img.alt} className="h-full w-full object-cover" /> : <ImageIcon size={14} className="text-ink-4" />}
              </div>
              <button type="button" onClick={() => onReplaceImage(img.index)} className="bg-panel hover:bg-panel-2/70 text-ink-2 hover:text-ink flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] transition-colors">
                <RefreshCw size={11} />
                {t('workbench.propsReplaceImage')}
              </button>
              <button type="button" onClick={() => onRemoveImage(img.index)} aria-label={t('workbench.propsRemoveImage')} title={t('workbench.propsRemoveImage')} className="text-ink-4 hover:text-ink rounded-md p-1.5">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </Group>
      )}

      {view && (
        <div className="px-3 pb-3 pt-2">
          <button
            type="button"
            onClick={() => onValues(resetStyle(view.schema as PropsSchema, view.values))}
            className="bg-panel hover:bg-panel-2/70 text-ink-3 hover:text-ink w-full rounded-md py-1.5 text-[11.5px] transition-colors"
          >
            {t('workbench.propsResetStyle')}
          </button>
        </div>
      )}
    </div>
  );
}
