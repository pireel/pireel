'use client';

/**
 * Inspector for a component (registered or bespoke): everything the user can change without
 * regenerating it, in one docked panel (the rail tab "Properties").
 *
 *  - Properties: the unified component contract (component-schema.ts) rendered by PropsForm;
 *    bespoke drags paint the preview live, release commits one undo step; registered components
 *    re-render on commit.
 *  - Text: every data-edit element of bespoke markup is a text field; committing writes through the
 *    same path the canvas double-click uses, so both stay one value.
 *  - Images: every <img> slot of bespoke markup with its thumbnail; replace/remove go through the
 *    existing slot path.
 *
 * Same visual language as the other rail panels: sections are soft fills (`bg-canvas/45`), no borders.
 */

import { useEffect, useState, type ReactNode } from 'react';
import type { Block } from '@pireel/studio-engine/composition';
import type { DisplayTextFontId } from '@pireel/studio-engine/composition';
import { dataEditFields, imageSlots } from '@pireel/studio-engine/component-props';
import { componentSchemaOf } from '@pireel/studio-engine/component-schema';
import { ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import type { Block as EditorBlock } from '@pireel/studio-engine/composition';
import { liveMessageFor } from './component-props-ui';
import { FontPicker } from './display-text-panel';
import { PropsForm, type PropsSchema } from './kit-props-panel';
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
  block?: Partial<Pick<EditorBlock, 'box' | 'scale' | 'rotation' | 'opacity' | 'bg' | 'border' | 'radius' | 'label'>>;
}

export interface ComponentPropsPanelProps {
  block: Block | null;
  /** Canvas size, for showing the box in percent and radius in px. */
  canvas: { width: number; height: number };
  /** Background / border swatches (theme paper and panel first). */
  swatches: ReadonlyArray<{ label: string; value: string }>;
  /** Commit a geometry / timing / appearance / label change (one undo step, no regeneration). */
  onBlockPatch: (patch: InspectorBlockPatch) => void;
  /** Commit the form's next values (registered or bespoke — the engine knows where they persist). */
  onValues: (next: Record<string, unknown>) => void;
  onLive: (message: { vars: Record<string, string>; attrs: Record<string, string> }) => void;
  onText: (key: string, value: string) => void;
  onReplaceImage: (index: number) => void;
  onRemoveImage: (index: number) => void;
}

function TextField({ fieldKey, text, onCommit }: { fieldKey: string; text: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);
  const commit = () => { if (draft !== text) onCommit(draft); };
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-3 truncate text-[11px]">{fieldKey}</span>
      <textarea
        value={draft}
        rows={draft.length > 24 ? 2 : 1}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        className="bg-canvas/70 text-ink placeholder:text-ink-5 focus:ring-ink-4/40 w-full resize-none rounded-md px-2.5 py-1.5 text-[12px] leading-5 outline-none focus:ring-1"
      />
    </label>
  );
}

const INPUT = 'bg-canvas/70 text-ink placeholder:text-ink-5 focus:ring-ink-4/40 w-full rounded-md px-2 py-1 text-[12px] tabular-nums outline-none focus:ring-1';

/** Compact numeric field: label above, commits on blur / Enter, shows the value the block actually has. */
function NumberField({ label, value, unit, min, max, step = 1, onCommit }: { label: string; value: number; unit?: string; min?: number; max?: number; step?: number; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) { setDraft(String(value)); return; }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (next !== value) onCommit(next);
    else setDraft(String(value));
  };
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-ink-4 text-[10px]">{label}{unit ? <span className="text-ink-5"> {unit}</span> : null}</span>
      <input
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={INPUT}
      />
    </label>
  );
}

function Slider({ label, value, min, max, step, display, onCommit }: { label: string; value: number; min: number; max: number; step: number; display: string; onCommit: (next: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between"><span className="text-ink-3 text-[11px]">{label}</span><span className="text-ink-4 text-[11px] tabular-nums">{display}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onCommit(Number(e.target.value))} className="accent-accent h-1.5 w-full cursor-pointer" />
    </div>
  );
}

/** Swatch row with a "none" pill and a custom colour picker — the same idiom as the props form. */
function ColorRow({ label, value, swatches, noneTitle, onCommit }: { label: string; value: string | undefined; swatches: ReadonlyArray<{ label: string; value: string }>; noneTitle: string; onCommit: (next: string | undefined) => void }) {
  const ring = 'ring-accent ring-2 ring-offset-1 ring-offset-panel';
  const swatch = 'h-6 w-6 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(127,127,127,0.25)] transition-transform hover:scale-105';
  const hex = /^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value! : '#ffffff';
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ink-3 text-[11px]">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onCommit(undefined)} title={noneTitle} aria-label={noneTitle} className={`${swatch} bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!value ? ring : ''}`} />
        {swatches.map((sw) => (
          <button key={sw.value} type="button" onClick={() => onCommit(sw.value)} title={sw.label} aria-label={sw.label} className={`${swatch} ${value?.toLowerCase() === sw.value.toLowerCase() ? ring : ''}`} style={{ background: sw.value }} />
        ))}
        <label className={`${swatch} relative cursor-pointer overflow-hidden bg-[conic-gradient(#ff6b5f,#ffd24d,#37d6b0,#4d7cfe,#b89cff,#ff6b5f)]`} title={t('kitProp.customColor')}>
          <input type="color" value={hex} onChange={(e) => onCommit(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={t('kitProp.customColor')} />
        </label>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="bg-canvas/45 rounded-lg p-3">
      <div className="text-ink-4 mb-2.5 text-[10px] font-medium tracking-[0.12em] uppercase">{label}</div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div data-block-selection-keep className="text-ink-4 flex h-full items-center justify-center px-6 text-center text-[11px] leading-5">{text}</div>;
}

export function ComponentPropsPanel({ block, canvas, swatches, onBlockPatch, onValues, onLive, onText, onReplaceImage, onRemoveImage }: ComponentPropsPanelProps) {
  const [localFonts, setLocalFonts] = useState<LocalFontFamilyOption[]>(cachedLocalFontFamilies);
  const [fontAccessState, setFontAccessState] = useState<'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported'>('idle');
  const requestLocalFonts = async () => {
    if (!supportsLocalFontAccess()) { setFontAccessState('unsupported'); return; }
    setFontAccessState('loading');
    try { setLocalFonts(await loadLocalFontFamilies()); setFontAccessState('loaded'); } catch { setFontAccessState('denied'); }
  };

  const view = block ? componentSchemaOf(block) : null;
  if (!block || (block.templateId !== 'custom' && !view)) return <Empty text={t('workbench.propsSelectHint')} />;
  // Text and image slots belong to bespoke markup; registered components carry their text in schema rows.
  const innerHtml = block.templateId === 'custom' && typeof block.slots.innerHtml === 'string' ? block.slots.innerHtml : '';
  const texts = dataEditFields(innerHtml);
  const images = imageSlots(innerHtml);
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  const box = block.box;
  const pct = (n: number) => round(n * 100, 1);
  const patchBox = (next: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (!box) return;
    onBlockPatch({ block: { box: { ...box, ...next } } });
  };
  return (
    // Clicking inside the inspector must not clear the selection it edits (the workbench treats any
    // host-UI region without this marker as "blank page → deselect").
    <div data-block-selection-keep className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
      {view && (
        <Section label={t('workbench.editableProperties')}>
          <PropsForm
            schema={view.schema as PropsSchema}
            values={view.values}
            resetMode={view.source === 'kit' ? 'theme' : 'default'}
            labelOf={(key) => { const k = `kitProp.${key}`; const l = t(k); return l === k ? key : l; }}
            onLive={view.source === 'manifest' ? (next) => { const message = liveMessageFor(block, next); if (message) onLive(message); } : undefined}
            onChange={onValues}
            renderFont={(key, value, commit) => (
              <FontPicker
                value={value as DisplayTextFontId}
                localFonts={localFonts}
                accessState={fontAccessState}
                onChoose={(font) => commit(font)}
                onLoadMore={() => void requestLocalFonts()}
              />
            )}
          />
        </Section>
      )}
      {texts.length > 0 && (
        <Section label={t('workbench.propsText')}>
          <div className="flex flex-col gap-3">
            {texts.map((field) => (
              <TextField key={field.key} fieldKey={field.key} text={field.text} onCommit={(value) => onText(field.key, value)} />
            ))}
          </div>
        </Section>
      )}
      <Section label={t('workbench.propsLayout')}>
        <div className="flex flex-col gap-3">
          {box && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label={t('workbench.propsX')} unit="%" value={pct(box.x)} step={0.5} min={-100} max={200} onCommit={(v) => patchBox({ x: v / 100 })} />
                <NumberField label={t('workbench.propsY')} unit="%" value={pct(box.y)} step={0.5} min={-100} max={200} onCommit={(v) => patchBox({ y: v / 100 })} />
                <NumberField label={t('workbench.propsW')} unit="%" value={pct(box.w)} step={0.5} min={2} max={200} onCommit={(v) => patchBox({ w: v / 100 })} />
                <NumberField label={t('workbench.propsH')} unit="%" value={pct(box.h)} step={0.5} min={2} max={200} onCommit={(v) => patchBox({ h: v / 100 })} />
              </div>
              <div className="text-ink-5 text-[10px] tabular-nums">{Math.round(box.w * canvas.width)} × {Math.round(box.h * canvas.height)} px</div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t('workbench.propsScale')} unit="%" value={round((block.scale ?? 1) * 100, 0)} step={1} min={10} max={400} onCommit={(v) => onBlockPatch({ block: { scale: Math.abs(v / 100 - 1) < 0.005 ? undefined : v / 100 } })} />
            <NumberField label={t('workbench.propsRotation')} unit="°" value={round(block.rotation ?? 0, 1)} step={1} min={-180} max={180} onCommit={(v) => onBlockPatch({ block: { rotation: v ? v : undefined } })} />
          </div>
        </div>
      </Section>
      <Section label={t('workbench.propsTiming')}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t('workbench.propsStart')} unit="s" value={round(block.startSec, 2)} step={0.1} min={0} onCommit={(v) => onBlockPatch({ startSec: v })} />
          <NumberField label={t('workbench.propsDuration')} unit="s" value={round(block.durationSec, 2)} step={0.1} min={0.3} onCommit={(v) => onBlockPatch({ durationSec: v })} />
        </div>
      </Section>
      <Section label={t('workbench.propsAppearance')}>
        <div className="flex flex-col gap-3">
          <ColorRow label={t('workbench.propsBackground')} value={block.bg} swatches={swatches} noneTitle={t('workbench.noBackground')} onCommit={(bg) => onBlockPatch({ block: { bg } })} />
          <ColorRow label={t('workbench.propsBorder')} value={block.border} swatches={swatches} noneTitle={t('workbench.propsNoBorder')} onCommit={(border) => onBlockPatch({ block: { border } })} />
          <Slider label={t('workbench.propsRadius')} value={block.radius ?? 0} min={0} max={160} step={2} display={`${block.radius ?? 0} px`} onCommit={(v) => onBlockPatch({ block: { radius: v > 0 ? v : undefined } })} />
          <Slider label={t('workbench.propsOpacity')} value={Math.round((block.opacity ?? 1) * 100)} min={5} max={100} step={5} display={`${Math.round((block.opacity ?? 1) * 100)}%`} onCommit={(v) => onBlockPatch({ block: { opacity: v >= 100 ? undefined : v / 100 } })} />
        </div>
      </Section>
      <Section label={t('workbench.propsName')}>
        <TextField fieldKey={t('workbench.propsNameHint')} text={block.label ?? ''} onCommit={(value) => onBlockPatch({ block: { label: value.trim().slice(0, 24) || undefined } })} />
      </Section>
      {images.length > 0 && (
        <Section label={t('workbench.propsImages')}>
          <div className="flex flex-col gap-2">
            {images.map((img) => (
              <div key={img.index} className="group flex items-center gap-2.5">
                <div className="bg-canvas/70 flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md">
                  {img.src ? <img src={img.src} alt={img.alt} className="h-full w-full object-cover" /> : <ImageIcon size={14} className="text-ink-4" />}
                </div>
                <button type="button" onClick={() => onReplaceImage(img.index)} className="bg-panel-2 text-ink-2 hover:bg-panel hover:text-ink flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-[11px]">
                  <RefreshCw size={11} />
                  {t('workbench.propsReplaceImage')}
                </button>
                <button type="button" onClick={() => onRemoveImage(img.index)} aria-label={t('workbench.propsRemoveImage')} title={t('workbench.propsRemoveImage')} className="text-ink-4 hover:text-ink rounded-md p-1.5">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
