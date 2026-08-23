'use client';

/**
 * One-click export card for export_video. The program derives resolution from the source,
 * preserves the current canvas ratio, and defaults to 30fps MP4. Explicit user-requested specs
 * may prefill/override that adaptive choice, but ordinary exports never ask the user to configure it.
 */

import { Check } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import type { ExportRecommendations } from '@pireel/studio-engine/export-options';
import { resolveInteraction, usePendingInteraction } from './interaction-store';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

export interface AdaptiveExportSelection {
  resolution: number;
  fps: number;
  format: 'mp4' | 'webm' | 'mov';
}

export function adaptiveExportSelection(
  rec: ExportRecommendations,
  explicit?: Partial<AdaptiveExportSelection>,
): AdaptiveExportSelection {
  const fallback = rec.options.find((option) => option.id === rec.defaultId) ?? rec.options[0];
  return {
    resolution: explicit?.resolution ?? fallback?.resolution ?? 1080,
    fps: explicit?.fps ?? fallback?.fps ?? 30,
    format: explicit?.format ?? fallback?.format ?? 'mp4',
  };
}

export function ExportSettingsCard({ part }: { part: ToolPartLike }) {
  const rec = usePendingInteraction<ExportRecommendations & { explicit?: Partial<AdaptiveExportSelection> }>('export');
  const active = part.state === 'input-available' || part.state === 'input-streaming';

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
  if (!active) return null;

  const selection = rec
    ? adaptiveExportSelection(rec, rec.explicit)
    : { resolution: 1080, fps: 30, format: 'mp4' as const };
  // Never render null while awaiting: an invisible parked turn reads as no reply at all.
  return (
    <AdaptiveExportPicker selection={selection} ready={!!rec} />
  );
}

export function AdaptiveExportPicker({ selection, ready }: { selection: AdaptiveExportSelection; ready: boolean }) {
  const spec = `${selection.resolution}p · ${selection.fps}fps · ${selection.format.toUpperCase()}`;
  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="text-ink-2 border-line/70 border-b px-2.5 py-1.5 text-[12px] font-medium">{t('workbench.export')}</div>
      <div className="flex items-center justify-between gap-3 p-2.5">
        <div className="min-w-0">
          <div className="text-ink-2 text-[12px]">{t('workbench.ratioFollowSource')}</div>
          <div className="text-ink-4 mt-0.5 text-[11px] tabular-nums">{spec}</div>
        </div>
        <button
          type="button"
          disabled={!ready}
          onClick={() => resolveInteraction(selection)}
          className="bg-ink text-bg shrink-0 rounded-md px-3 py-1 text-[12px] hover:opacity-90 disabled:opacity-30"
        >
          {t('workbench.exportStart')}
        </button>
      </div>
    </div>
  );
}
