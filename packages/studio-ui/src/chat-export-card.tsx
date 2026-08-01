'use client';

/**
 * Export-settings card: a single integrated panel for the export_video tool while it is parked.
 * Resolution / frame-rate / format segmented controls; the user picks and hits Export, which
 * resolves the tool and starts the render. Resolution offers up to 4K (upscaling is allowed — the
 * vector overlay re-rasterizes crisply; the source video just scales). Defaults to the source's
 * native resolution. Once started (output-available) the card shows a static spec confirmation.
 */

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { resolveExportChoice, usePendingExport } from './export-store';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

const RES_TIERS: { v: number; label: string }[] = [
  { v: 720, label: '720p' },
  { v: 1080, label: '1080p' },
  { v: 1440, label: '2K' },
  { v: 2160, label: '4K' },
];
const FPS_TIERS = [24, 30, 60] as const;
const FORMATS = ['mp4', 'webm', 'mov'] as const;

const TIERS = [2160, 1440, 1080, 720, 540];
function nativeTier(shortSide: number): number {
  return TIERS.find((v) => v <= shortSide) ?? 720;
}

function Seg<T extends number | string>({ value, options, onChange, fmt }: { value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; fmt?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md border px-2.5 py-0.5 text-[12px] tabular-nums transition-colors ${
            o.v === value ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:border-accent/60'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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

  return <Picker defaultRes={nativeTier(rec.source.shortSide)} />;
}

function Picker({ defaultRes }: { defaultRes: number }) {
  const [res, setRes] = useState<number>(defaultRes);
  const [fps, setFps] = useState<number>(30);
  const [format, setFormat] = useState<'mp4' | 'webm' | 'mov'>('mp4');

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="text-ink-2 border-line/70 border-b px-2.5 py-1.5 text-[12px] font-medium">{t('workbench.exportSettings')}</div>
      <div className="flex flex-col gap-2.5 p-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportResolution')}</span>
          <Seg value={res} options={RES_TIERS} onChange={setRes} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportFps')}</span>
          <Seg value={fps} options={FPS_TIERS.map((v) => ({ v, label: `${v}fps` }))} onChange={setFps} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-4 text-[11px]">{t('workbench.exportFormat')}</span>
          <Seg value={format} options={FORMATS.map((v) => ({ v, label: v.toUpperCase() }))} onChange={(v) => setFormat(v as 'mp4' | 'webm' | 'mov')} />
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
