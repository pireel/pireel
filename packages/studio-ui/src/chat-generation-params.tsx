'use client';

/**
 * Parameter row of the composer's generation modes — the configuration the retired generation panel
 * held: model, aspect, count, quality (image); model, aspect, duration, resolution (video); type and
 * duration (audio). Options come from the same sources as before (`/api/models?kind=…`, the shell's
 * per-model parameter tables), and the credit estimate reuses useQuote. The chosen values ride in the
 * message's intent line; the agent passes them to the generation tool.
 */

import { useEffect, useMemo } from 'react';
import { useQuote } from '@pireel/ui/use-quote';
import { useStudioShell } from './shell-context';
import { t } from './i18n';
import type { GenerationIntent, GenerationParams } from './chat-generation-intent';

const RATIOS: NonNullable<GenerationParams['ratio']>[] = ['9:16', '16:9', '1:1'];

/** gpt-image needs a concrete size for both the provider and the billing tier; other models take an aspect. */
function imageSizeParam(modelId: string, ratio: string): string {
  if (modelId === 'gpt-image' || modelId === 'gpt-image-2') {
    return ratio === '16:9' ? '2560x1440' : ratio === '1:1' ? '1024x1024' : '1440x2560';
  }
  return ratio;
}

export function GenerationParamsBar({
  intent,
  params,
  models,
  onChange,
}: {
  intent: GenerationIntent;
  params: GenerationParams;
  /** Hosted model catalog for this kind (fetched by the composer; empty = default model only). */
  models: { id: string; name: string }[];
  onChange: (next: GenerationParams) => void;
}) {
  const shell = useStudioShell();
  const modelId = params.modelId ?? models[0]?.id ?? '';
  const qualityCfg = intent === 'image' ? (shell.modelParams?.qualityConfigFor(modelId) ?? null) : null;
  const resolutionOptions = intent === 'video' ? (shell.modelParams?.videoResolutionOptions(modelId) ?? []) : [];
  const durationOptions = intent === 'video'
    ? (shell.modelParams?.videoDurationOptions(modelId) ?? ['5', '10'])
    : intent === 'audio'
      ? ((params.audioKind ?? 'music') === 'sfx' ? ['1', '3', '5'] : ['30', '60', '120', '180'])
      : [];

  // Switching model (or arming the mode) settles the dependent fields on that model's defaults, the
  // way the panel did: quality tier for images, a supported resolution/duration tier for video.
  useEffect(() => {
    if (intent === 'image') {
      const next = qualityCfg?.default ?? undefined;
      if (next !== params.quality) onChange({ ...params, modelId, quality: next });
    } else if (intent === 'video') {
      const resolution = resolutionOptions.includes(params.resolution ?? '') ? params.resolution : resolutionOptions.includes('720p') ? '720p' : resolutionOptions[0];
      const duration = params.durationSec && durationOptions.includes(String(params.durationSec)) ? params.durationSec : Number(durationOptions[0] ?? 5);
      if (resolution !== params.resolution || duration !== params.durationSec || modelId !== params.modelId) onChange({ ...params, modelId, resolution, durationSec: duration });
    } else if (intent === 'audio') {
      if (!params.durationSec || !durationOptions.includes(String(params.durationSec))) onChange({ ...params, durationSec: Number(durationOptions[1] ?? durationOptions[0] ?? 60) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, modelId, params.audioKind]);

  const quoteParams = useMemo<Record<string, unknown>>(() => {
    const ratio = params.ratio ?? '9:16';
    if (intent === 'image') return { n: Math.min(4, Math.max(1, params.count ?? 1)), size: imageSizeParam(modelId, ratio), ...(params.quality ? { quality: params.quality } : {}) };
    if (intent === 'video') return { duration_sec: String(params.durationSec ?? 5), count: 1, resolution: params.resolution ?? '720p', aspect_ratio: ratio === '1:1' ? '9:16' : ratio, generate_audio: false };
    if (intent === 'audio') return { tier: 'song' };
    return {};
  }, [intent, params, modelId]);
  const credits = useQuote({
    toolId: intent === 'video' ? 'video-gen' : intent === 'audio' ? 'music-gen' : 'image-gen',
    modelId: intent === 'element' || intent === 'audio' ? '' : modelId,
    params: quoteParams,
  });

  if (intent === 'element') return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1">
      {models.length > 1 && (intent === 'image' || intent === 'video') ? (
        <label className="inline-flex items-center gap-1">
          <span className="text-ink-4 text-[10.5px]">{t('chatGen.paramModel')}</span>
          <select
            value={modelId}
            onChange={(event) => onChange({ ...params, modelId: event.target.value })}
            className="border-line bg-panel text-ink h-6 max-w-[150px] rounded-md border px-1 text-[10.5px] outline-none"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {intent === 'audio' ? (
        <ParamGroup
          label={t('chatGen.paramAudioKind')}
          options={[{ value: 'music', label: t('chatGen.audioKindMusic') }, { value: 'sfx', label: t('chatGen.audioKindSfx') }]}
          value={params.audioKind ?? 'music'}
          onChange={(value) => onChange({ ...params, audioKind: value as 'music' | 'sfx', durationSec: undefined })}
        />
      ) : null}
      {intent === 'image' || intent === 'video' ? (
        <ParamGroup
          label={t('chatGen.paramRatio')}
          options={RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
          value={params.ratio ?? '9:16'}
          onChange={(value) => onChange({ ...params, ratio: value as GenerationParams['ratio'] })}
        />
      ) : null}
      {intent === 'image' ? (
        <ParamGroup
          label={t('chatGen.paramCount')}
          options={[1, 2, 4].map((n) => ({ value: String(n), label: String(n) }))}
          value={String(params.count ?? 1)}
          onChange={(value) => onChange({ ...params, count: Number(value) })}
        />
      ) : null}
      {intent === 'image' && qualityCfg && qualityCfg.options.length > 1 ? (
        <ParamGroup
          label={t('chatGen.paramQuality')}
          options={qualityCfg.options.map((option) => ({ value: option.value, label: option.label }))}
          value={params.quality ?? qualityCfg.default}
          onChange={(value) => onChange({ ...params, quality: value })}
        />
      ) : null}
      {intent === 'video' || intent === 'audio' ? (
        <ParamGroup
          label={t('chatGen.paramDuration')}
          options={durationOptions.map((option) => ({ value: option, label: `${option}s` }))}
          value={String(params.durationSec ?? durationOptions[0] ?? '')}
          onChange={(value) => onChange({ ...params, durationSec: Number(value) })}
        />
      ) : null}
      {intent === 'video' && resolutionOptions.length > 1 ? (
        <ParamGroup
          label={t('chatGen.paramResolution')}
          options={resolutionOptions.map((option) => ({ value: option, label: option }))}
          value={params.resolution ?? resolutionOptions[0]!}
          onChange={(value) => onChange({ ...params, resolution: value })}
        />
      ) : null}
      {credits != null ? <span className="text-ink-4 ml-auto text-[10.5px] tabular-nums">{t('chatGen.estimatedCredits', { n: credits })}</span> : null}
    </div>
  );
}

/** One labelled row of exclusive chips. */
export function ParamGroup({ label, options, value, onChange }: { label: string; options: readonly { value: string; label: string }[]; value: string | undefined; onChange: (value: string) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-ink-4 text-[10.5px]">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`h-6 rounded-md px-1.5 text-[10.5px] transition ${value === option.value ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'}`}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
