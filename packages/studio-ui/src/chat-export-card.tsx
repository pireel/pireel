'use client';

/**
 * Export-settings card: a single integrated panel for the export_video tool while it is parked.
 * Platform presets (Xiaohongshu / Douyin·TikTok / YouTube / Source) are quick-fills — clicking one
 * loads its resolution/fps/format into the controls, which the user can still tweak. Resolution
 * tiers above the source's native short side are disabled (no upscaling). Export resolves the tool.
 * Once the export has started (output-available) the card shows a static confirmation instead.
 */

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import type { ExportOption } from '@pireel/studio-engine/export-options';
import { resolveExportChoice, usePendingExport } from './export-store';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

const FPS_TIERS = [24, 30, 60] as const;
const FORMATS = ['mp4', 'webm', 'mov'] as const;
const ALL_RES = [540, 720, 1080, 1440, 2160] as const;

/** Localized preset name by stable id (the English platform label from the engine is agent-data). */
function presetLabel(id: ExportOption['id']): string {
  return t(`workbench.exportPreset_${id}`);
}

export function ExportSettingsCard({ part }: { part: ToolPartLike }) {
  const rec = usePendingExport();
  const active = (part.state === 'input-available' || part.state === 'input-streaming') && !!rec;

  // Started (output-available): static confirmation of the chosen specs
  if (part.state === 'output-available') {
    const out = part.output as StudioToolResult | undefined;
    const o = out?.data as { options?: { res?: number; fps?: number; format?: string } } | undefined;
    const spec = o?.options ? `${o.options.res}p · ${o.options.fps}fps · ${String(o.options.format).toUpperCase()}` : '';
    return (
      <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
        <div className="text-ink-3 flex items-center gap-2 px-2.5 py-1.5 text-[12px]">
          <Check size={12} className="text-accent shrink-0" />
          <span>{out?.summary || t('workbench.exportStartedLocalClient')}</span>
          {spec && <span className="text-ink-4 ml-auto tabular-nums">{spec}</span>}
        </div>
      </div>
    );
  }
  if (!active || !rec) return null;

  const nativeShort = rec.source.shortSide;
  const def = rec.options.find((o) => o.id === rec.defaultId) ?? rec.options[0]!;
  return <Picker rec={rec} nativeShort={nativeShort} def={def} />;
}

function Picker({ rec, nativeShort, def }: { rec: NonNullable<ReturnType<typeof usePendingExport>>; nativeShort: number; def: ExportOption }) {
  const [res, setRes] = useState<number>(def.resolution);
  const [fps, setFps] = useState<number>(def.fps);
  const [format, setFormat] = useState<'mp4' | 'webm' | 'mov'>(def.format);
  const [activePreset, setActivePreset] = useState<ExportOption['id']>(def.id);

  const applyPreset = (o: ExportOption) => {
    setRes(o.resolution);
    setFps(o.fps);
    setFormat(o.format);
    setActivePreset(o.id);
  };
  const resTiers = ALL_RES.filter((v) => v <= nativeShort || v === 540); // never above native (540 always allowed as a floor)

  const Seg = <T extends number | string>({ value, options, onChange, fmt }: { value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string }) => (
    <div className="flex flex-wrap gap-1">
      {options.map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md border px-2 py-0.5 text-[12px] tabular-nums transition-colors ${
            v === value ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:border-accent/60'
          }`}
        >
          {fmt ? fmt(v) : String(v)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="text-ink-2 border-line/70 border-b px-2.5 py-1.5 text-[12px] font-medium">{t('workbench.exportSettings')}</div>
      <div className="flex flex-col gap-2.5 p-2.5">
        {/* Presets: quick-fill the controls below */}
        <div className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportPresets')}</span>
          <div className="flex flex-wrap gap-1">
            {rec.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => applyPreset(o)}
                title={`${o.resolution}p · ${o.fps}fps · ${o.format.toUpperCase()}`}
                className={`rounded-md border px-2 py-1 text-[12px] transition-colors ${
                  o.id === activePreset ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:border-accent/60'
                }`}
              >
                {presetLabel(o.id)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportResolution')}</span>
          <Seg value={res} options={resTiers} onChange={(v) => { setRes(v); setActivePreset('' as ExportOption['id']); }} fmt={(v) => `${v}p`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportFps')}</span>
          <Seg value={fps} options={FPS_TIERS} onChange={(v) => { setFps(v); setActivePreset('' as ExportOption['id']); }} fmt={(v) => `${v}fps`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportFormat')}</span>
          <Seg value={format} options={FORMATS} onChange={(v) => { setFormat(v); setActivePreset('' as ExportOption['id']); }} fmt={(v) => v.toUpperCase()} />
        </label>
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-ink-4 text-[11px] tabular-nums">
            {res}p · {fps}fps · {format.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={() => resolveExportChoice({ resolution: res, fps, format })}
            className="bg-ink rounded-md px-3 py-1 text-[12px] text-white hover:bg-black"
          >
            {t('workbench.exportStart')}
          </button>
        </div>
      </div>
    </div>
  );
}
