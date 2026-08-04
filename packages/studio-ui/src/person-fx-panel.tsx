'use client';

/**
 * Person panel (toolbar "Person" entry): smart-matte toggle (per-shot, only the selected
 * shot) + global effect styles — person on top, feather, stroke, background swap. Values
 * are unitless 0–100 (a mainstream editor convention), assemble converts to px by canvas resolution.
 * All edits publish native appearance patches; preview rebuild remains debounced and double-buffered.
 * Effect config stays expanded: disabled/dimmed when no shot has matte on, hover hints to enable the toggle first.
 */

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { Composition, PersonFx } from '@pireel/studio-engine/composition';
import { imageThumb } from '@pireel/ui/image-url';
import { toast } from '@pireel/ui/toast';
import { Switch } from '@pireel/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pireel/ui/tooltip';
import { uploadImageFile } from './media';
import { t } from './i18n';

type StrokeStyle = 'none' | 'solid' | 'dashed';

/** Mask-track budget progress (fed by the parent's runMatteBatch). */
export interface MatteState {
  status: 'idle' | 'running' | 'ready' | 'error';
  done: number;
  total: number;
}

/** Person silhouette preview for a stroke-style card (1:1 frame filling the card, isomorphic to the real effect: filled silhouette + stroke along the outline). */
function BustPreview({ style }: { style: StrokeStyle }) {
  const outline = 'M48 25 a13 13 0 1 1 -0.01 0 Z M20 86 C20 62 33 56 48 56 C63 56 76 62 76 86 Z';
  return (
    <svg viewBox="0 0 96 96" className="w-full" aria-hidden>
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" className="text-ink-3" />
      <clipPath id={`bp-${style}`}>
        <rect x="1.5" y="1.5" width="93" height="93" rx="4.5" />
      </clipPath>
      <g clipPath={`url(#bp-${style})`}>
        <path d={outline} fill="currentColor" className="text-ink-3" />
        {style !== 'none' && (
          <path
            d={outline}
            fill="none"
            stroke="var(--color-accent, #3f4be8)"
            strokeWidth="3.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={style === 'dashed' ? '7 5' : undefined}
          />
        )}
      </g>
    </svg>
  );
}

const STROKE_CARDS: { style: StrokeStyle; name: string }[] = [
  { style: 'none', name: 'common.none' },
  { style: 'solid', name: 'panels.solid' },
  { style: 'dashed', name: 'panels.dashed' },
];

export function PersonFxPanel({
  comp,
  onChange,
  matte,
  selectedShotMatte,
  onToggleShotMatte,
  onRetry,
}: {
  comp: Composition;
  onChange: (fx: PersonFx | undefined) => void;
  matte: MatteState;
  /** Matte toggle state of the selected shot; null = no shot selected (toggle disabled). */
  selectedShotMatte: boolean | null;
  onToggleShotMatte: (on: boolean) => void;
  onRetry: () => void;
}) {
  const fx = comp.personFx ?? {};
  const anyMatte = (comp.shots ?? []).some((s) => s.personMatte);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Drop the field when everything is default (don't persist an empty object in the draft)
  const commit = (next: PersonFx) => {
    const empty = !next.personFront && !(next.feather && next.feather > 0) && !(next.stroke && next.stroke.width > 0) && !next.bg;
    onChange(empty ? undefined : next);
  };
  const stroke = fx.stroke;
  const accent = comp.palette?.accent;
  const setStrokeStyle = (style: StrokeStyle) => {
    if (style === 'none') commit({ ...fx, stroke: undefined });
    else
      commit({
        ...fx,
        stroke: {
          style,
          width: stroke?.width ?? 40,
          color: stroke?.color ?? '#ffffff',
          opacity: stroke?.opacity ?? 1,
        },
      });
  };

  const pickBgImage = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    try {
      const url = await uploadImageFile(f);
      commit({ ...fx, bg: { type: 'image', url } });
    } catch {
      toast.error(t('panels.imageUploadFailedTry'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 w-full flex-col">
        {/* Title/close live in the floating-window header; only a one-line hint here */}
        <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.smartCutoutHint')}</div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
          {!comp.video && <div className="text-ink-4">{t('panels.uploadVideoForPortraitFx')}</div>}

          {/* Per-shot toggle + budget progress: only affects the currently selected shot; can't enable with nothing selected */}
          <section className="flex flex-col gap-1.5">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-ink font-medium">{t('panels.smartCutout')}</span>
              <Switch
                checked={!!selectedShotMatte}
                aria-label={t('panels.smartCutoutToggle')}
                disabled={selectedShotMatte === null}
                onCheckedChange={onToggleShotMatte}
              />
            </label>
            <div className="text-ink-4 text-[10.5px]">
              {selectedShotMatte === null ? t('panels.selectShotTimelineFirst') : t('panels.appliesOnlySelectedShot')}
            </div>
            {matte.status === 'running' && (
              <div className="flex flex-col gap-1 pt-0.5">
                <div className="bg-line-2 h-1 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-accent h-full rounded-full transition-[width]"
                    style={{
                      width: `${matte.total ? Math.round((matte.done / matte.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="text-ink-4 flex items-center gap-1 text-[10.5px]">
                  <Loader2 size={10} className="animate-spin" />
                  {t('panels.processingDoneTotalPct', { done: matte.done, total: matte.total, pct: matte.total ? Math.round((matte.done / matte.total) * 100) : 0 })}
                </div>
              </div>
            )}
            {anyMatte && matte.status === 'ready' && <div className="text-ink-4 text-[10.5px]">{t('panels.readyFrames', { n: matte.done })}</div>}
            {anyMatte && matte.status === 'error' && (
              <div className="text-destructive flex items-center gap-2 text-[10.5px]">
                {t('panels.processingFailed')}
                <button type="button" onClick={onRetry} className="text-ink underline">
                  {t('common.retry')}
                </button>
              </div>
            )}
          </section>

          {/* Effect config: always expanded; disabled/dimmed when matte is off, hover hints to enable the toggle first */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col gap-4">
                <div className={`flex flex-col gap-4 ${anyMatte ? '' : 'pointer-events-none select-none opacity-45'}`}>
                  {/* Person on top */}
                  <section className="flex flex-col gap-1.5">
                    <label className="flex cursor-pointer items-center justify-between">
                      <span className="text-ink font-medium">{t('panels.personTop')}</span>
                      <Switch
                        checked={!!fx.personFront}
                        aria-label={t('panels.personTopToggle')}
                        disabled={!anyMatte}
                        onCheckedChange={(checked) =>
                          commit({ ...fx, personFront: checked || undefined })
                        }
                      />
                    </label>
                    <div className="text-ink-4 text-[10.5px]">{t('panels.personSitsAboveAll')}</div>
                  </section>
                  {/* Feather */}
                  <section className="flex flex-col gap-1.5">
                    <div className="text-ink flex items-center justify-between font-medium">
                      <span>{t('panels.edgeFeather')}</span>
                      <span className="text-ink-4 tabular-nums">{Math.round(fx.feather ?? 0)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={fx.feather ?? 0}
                      onChange={(e) => commit({ ...fx, feather: Number(e.target.value) })}
                      className="zoom-range w-full"
                      aria-label={t('panels.edgeFeather')}
                    />
                  </section>

                  {/* Stroke: style cards + config */}
                  <section className="flex flex-col gap-2">
                    <div className="text-ink font-medium">{t('panels.portraitStroke')}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {STROKE_CARDS.map((card) => {
                        const active = card.style === 'none' ? !stroke : stroke?.style === card.style;
                        return (
                          <button
                            key={card.style}
                            type="button"
                            onClick={() => setStrokeStyle(card.style)}
                            aria-label={t('panels.strokeStyleName', { name: t(card.name) })}
                            className={`bg-panel-2 flex flex-col items-center gap-1 rounded-lg border p-1.5 pb-1 transition ${
                              active ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-ink-4'
                            }`}
                          >
                            <BustPreview style={card.style} />
                            <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-ink-3'}`}>{t(card.name)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {stroke && (
                      <div className="flex flex-col gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('panels.color')}</span>
                          {[
                            ...(accent ? ([['panels.themeAccent', accent]] as [string, string][]) : []),
                            ['panels.white', '#ffffff'] as [string, string],
                            ['panels.black', '#101114'] as [string, string],
                          ].map(([name, colorVal]) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() =>
                                commit({
                                  ...fx,
                                  stroke: { ...stroke, color: colorVal },
                                })
                              }
                              title={t('panels.strokeName', { name: t(name) })}
                              aria-label={t('panels.strokeName', { name: t(name) })}
                              className={`h-5 w-5 shrink-0 rounded-full border ${stroke.color.toLowerCase() === colorVal.toLowerCase() ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                              style={{ background: colorVal }}
                            />
                          ))}
                          <label
                            title={t('panels.customStrokeColor')}
                            className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                            style={{
                              background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)',
                            }}
                          >
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}/.test(stroke.color) ? stroke.color.slice(0, 7) : '#ffffff'}
                              onChange={(e) =>
                                commit({
                                  ...fx,
                                  stroke: { ...stroke, color: e.target.value },
                                })
                              }
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                              aria-label={t('panels.customStrokeColor')}
                            />
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('panels.width')}</span>
                          <input
                            type="range"
                            min={1}
                            max={100}
                            step={1}
                            value={stroke.width}
                            onChange={(e) =>
                              commit({
                                ...fx,
                                stroke: { ...stroke, width: Number(e.target.value) },
                              })
                            }
                            className="zoom-range min-w-0 flex-1"
                            aria-label={t('panels.strokeWidth')}
                          />
                          <span className="text-ink-4 w-6 shrink-0 text-right tabular-nums text-[10px]">{stroke.width}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('panels.opacity')}</span>
                          <input
                            type="range"
                            min={5}
                            max={100}
                            step={1}
                            value={Math.round((stroke.opacity ?? 1) * 100)}
                            onChange={(e) =>
                              commit({
                                ...fx,
                                stroke: {
                                  ...stroke,
                                  opacity: Number(e.target.value) / 100,
                                },
                              })
                            }
                            className="zoom-range min-w-0 flex-1"
                            aria-label={t('panels.strokeOpacity')}
                          />
                          <span className="text-ink-4 w-6 shrink-0 text-right tabular-nums text-[10px]">{Math.round((stroke.opacity ?? 1) * 100)}%</span>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Replace background */}
                  <section className="flex flex-col gap-1.5">
                    <div className="text-ink font-medium">{t('panels.replaceBackground')}</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => commit({ ...fx, bg: undefined })}
                        title={t('panels.keepBackground')}
                        aria-label={t('panels.keepBackground')}
                        className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!fx.bg ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                      />
                      {[
                        ...(comp.palette?.paper ? ([['panels.themePaper', comp.palette.paper]] as [string, string][]) : []),
                        ['panels.white', '#ffffff'] as [string, string],
                        ['panels.black', '#101114'] as [string, string],
                      ].map(([name, colorVal]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => commit({ ...fx, bg: { type: 'color', color: colorVal } })}
                          title={t('panels.backgroundName', { name: t(name) })}
                          aria-label={t('panels.backgroundName', { name: t(name) })}
                          className={`h-5 w-5 shrink-0 rounded-full border ${fx.bg?.type === 'color' && fx.bg.color.toLowerCase() === colorVal.toLowerCase() ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                          style={{ background: colorVal }}
                        />
                      ))}
                      <label
                        title={t('panels.customBackgroundColor')}
                        className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                        style={{
                          background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)',
                        }}
                      >
                        <input
                          type="color"
                          value={fx.bg?.type === 'color' && /^#[0-9a-fA-F]{6}/.test(fx.bg.color) ? fx.bg.color.slice(0, 7) : '#ffffff'}
                          onChange={(e) =>
                            commit({
                              ...fx,
                              bg: { type: 'color', color: e.target.value },
                            })
                          }
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label={t('panels.customBackgroundColor')}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className={`inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] ${fx.bg?.type === 'image' ? 'border-accent text-accent' : 'border-line text-ink-3 hover:text-ink'}`}
                      >
                        {uploading ? <Loader2 size={10} className="animate-spin" /> : <ImagePlus size={10} />} {t('panels.image')}
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickBgImage(e.target.files?.[0] ?? null)} />
                    </div>
                    {fx.bg?.type === 'image' && (
                      <div className="border-line relative mt-1 w-fit overflow-hidden rounded-md border">
                        <img src={imageThumb(fx.bg.url, 'thumb')} alt={t('panels.backgroundImage')} className="h-20 w-auto object-cover" />
                        <button
                          type="button"
                          onClick={() => commit({ ...fx, bg: undefined })}
                          aria-label={t('panels.removeBackgroundImage')}
                          className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                    <div className="text-ink-4 text-[10.5px]">{t('panels.afterSwappingCutoutFills')}</div>
                  </section>
                </div>
              </div>
            </TooltipTrigger>
            {!anyMatte && <TooltipContent>{t('panels.turnSmartCutoutFirst')}</TooltipContent>}
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
