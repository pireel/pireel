'use client';

/**
 * Toolbar controls of the composer's generation modes — the configuration the retired generation
 * panel held, collapsed into icons on the input's bottom row (like the theme button in Agent mode):
 *  - Ideas: a large dialog of template cards (image/video previews, prompt cards for audio/graphics);
 *  - Settings: a popover with model (image/video), aspect / count / quality (image), aspect /
 *    duration / resolution (video), type / duration (audio).
 * The credit estimate (useQuote) renders next to the send button. Options come from the same sources
 * as before (`/api/models?kind=…`, the shell's per-model tables); the chosen values ride in the
 * message's intent line.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, SlidersHorizontal } from 'lucide-react';
import { useQuote } from '@pireel/ui/use-quote';
import { imageThumb } from '@pireel/ui/image-url';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { useStudioShell } from './shell-context';
import { studioLocale, t } from './i18n';
import { generationTemplates, type GenerationIntent, type GenerationParams } from './chat-generation-intent';

const RATIOS: NonNullable<GenerationParams['ratio']>[] = ['9:16', '16:9', '1:1'];
const TOOL_BUTTON = 'text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-30';

/** gpt-image needs a concrete size for both the provider and the billing tier; other models take an aspect. */
function imageSizeParam(modelId: string, ratio: string): string {
  if (modelId === 'gpt-image' || modelId === 'gpt-image-2') {
    return ratio === '16:9' ? '2560x1440' : ratio === '1:1' ? '1024x1024' : '1440x2560';
  }
  return ratio;
}

/** Icon button with an anchored popover. The panel is portaled to <body> and fixed above the trigger,
 * so the chat column's scroll/overflow clipping cannot cut it off (click-outside / Escape close). */
function PopButton({ icon, title, active, disabled, children }: { icon: ReactNode; title: string; active?: boolean; disabled?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 280)), bottom: window.innerHeight - rect.top + 6 });
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title={title}
        aria-label={title}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`${TOOL_BUTTON} ${active || open ? 'bg-accent/15 text-accent hover:bg-accent/25' : ''}`}
      >
        {icon}
      </button>
      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              style={{ position: 'fixed', left: anchor.left, bottom: anchor.bottom }}
              className="border-line bg-panel z-[70] min-w-[260px] max-w-[min(420px,calc(100vw-16px))] rounded-lg border p-2 shadow-lg"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** One labelled row of exclusive chips. */
function Row({ label, options, value, onChange }: { label: string; options: readonly { value: string; label: string }[]; value: string | undefined; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span className="text-ink-4 w-12 shrink-0 text-[10.5px]">{label}</span>
      <div className="flex flex-wrap gap-0.5">
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
      </div>
    </div>
  );
}

/** The ideas dialog: template cards for the armed kind; a click fills the composer. */
function IdeasDialog({ intent, open, onClose, onUse }: { intent: GenerationIntent; open: boolean; onClose: () => void; onUse: (prompt: string) => void }) {
  const templates = useMemo(() => generationTemplates(intent, studioLocale(), 24), [intent]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-panel border-line w-[min(1120px,calc(100vw-2rem))] gap-3 p-4">
        <DialogHeader className="pr-7">
          <DialogTitle className="text-ink text-[14px]">{t('chatGen.templates')}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[78vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              title={template.prompt}
              onClick={() => {
                onUse(template.prompt);
                onClose();
              }}
              className="border-line hover:border-accent group overflow-hidden rounded-lg border text-left transition"
            >
              {template.video ? (
                <video
                  src={imageThumb(template.video, 'original')}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="aspect-[4/5] w-full bg-black object-cover"
                  onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})}
                  onMouseLeave={(event) => {
                    event.currentTarget.pause();
                    event.currentTarget.currentTime = 0;
                  }}
                />
              ) : template.image ? (
                <img src={imageThumb(template.image, 'list')} alt="" loading="lazy" className="aspect-[4/5] w-full bg-[#f3f3f0] object-cover" />
              ) : (
                <div className="bg-panel-2 flex aspect-[4/5] flex-col justify-end p-2.5">
                  <div className="text-ink-2 line-clamp-6 text-[11px] leading-snug">{template.prompt}</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GenerationControls({
  intent,
  params,
  models,
  disabled,
  onChange,
  onUseTemplate,
}: {
  intent: GenerationIntent;
  params: GenerationParams;
  /** Hosted model catalog for this kind (fetched by the composer; empty = default model only). */
  models: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (next: GenerationParams) => void;
  onUseTemplate: (prompt: string) => void;
}) {
  const shell = useStudioShell();
  const [ideasOpen, setIdeasOpen] = useState(false);
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
      if (next !== params.quality || modelId !== params.modelId) onChange({ ...params, ...(modelId ? { modelId } : {}), quality: next });
    } else if (intent === 'video') {
      const resolution = resolutionOptions.includes(params.resolution ?? '') ? params.resolution : resolutionOptions.includes('720p') ? '720p' : resolutionOptions[0];
      const duration = params.durationSec && durationOptions.includes(String(params.durationSec)) ? params.durationSec : Number(durationOptions[0] ?? 5);
      if (resolution !== params.resolution || duration !== params.durationSec || modelId !== params.modelId) onChange({ ...params, ...(modelId ? { modelId } : {}), resolution, durationSec: duration });
    } else if (intent === 'audio') {
      if (!params.durationSec || !durationOptions.includes(String(params.durationSec))) onChange({ ...params, durationSec: Number(durationOptions[1] ?? durationOptions[0] ?? 60) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, modelId, params.audioKind]);

  const hasSettings = intent !== 'element';
  const hasIdeas = generationTemplates(intent, studioLocale(), 1).length > 0;

  return (
    <>
      {hasIdeas ? (
        <button
          type="button"
          disabled={disabled}
          title={t('chatGen.templates')}
          aria-label={t('chatGen.templates')}
          onClick={() => setIdeasOpen(true)}
          className={TOOL_BUTTON}
        >
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      ) : null}
      {hasSettings ? (
        <PopButton icon={<SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.2} />} title={t('chatGen.generationSettings')} disabled={disabled}>
          {models.length > 1 && (intent === 'image' || intent === 'video') ? (
            <div className="flex items-center gap-1 py-0.5">
              <span className="text-ink-4 w-12 shrink-0 text-[10.5px]">{t('chatGen.model')}</span>
              <select
                value={modelId}
                onChange={(event) => onChange({ ...params, modelId: event.target.value })}
                aria-label={t('chatGen.chooseModel')}
                className="border-line bg-panel text-ink h-6 min-w-0 flex-1 rounded-md border px-1 text-[10.5px] outline-none"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {intent === 'audio' ? (
            <Row
              label={t('chatGen.paramAudioKind')}
              options={[{ value: 'music', label: t('chatGen.audioKindMusic') }, { value: 'sfx', label: t('chatGen.audioKindSfx') }]}
              value={params.audioKind ?? 'music'}
              onChange={(value) => onChange({ ...params, audioKind: value as 'music' | 'sfx', durationSec: undefined })}
            />
          ) : null}
          {intent === 'image' || intent === 'video' ? (
            <Row
              label={t('chatGen.paramRatio')}
              options={RATIOS.map((ratio) => ({ value: ratio, label: ratio }))}
              value={params.ratio ?? '9:16'}
              onChange={(value) => onChange({ ...params, ratio: value as GenerationParams['ratio'] })}
            />
          ) : null}
          {intent === 'image' ? (
            <Row
              label={t('chatGen.paramCount')}
              options={[1, 2, 4].map((n) => ({ value: String(n), label: String(n) }))}
              value={String(params.count ?? 1)}
              onChange={(value) => onChange({ ...params, count: Number(value) })}
            />
          ) : null}
          {intent === 'image' && qualityCfg && qualityCfg.options.length > 1 ? (
            <Row
              label={t('chatGen.paramQuality')}
              options={qualityCfg.options.map((option) => ({ value: option.value, label: option.label }))}
              value={params.quality ?? qualityCfg.default}
              onChange={(value) => onChange({ ...params, quality: value })}
            />
          ) : null}
          {intent === 'video' || intent === 'audio' ? (
            <Row
              label={t('chatGen.paramDuration')}
              options={durationOptions.map((option) => ({ value: option, label: `${option}s` }))}
              value={String(params.durationSec ?? durationOptions[0] ?? '')}
              onChange={(value) => onChange({ ...params, durationSec: Number(value) })}
            />
          ) : null}
          {intent === 'video' && resolutionOptions.length > 1 ? (
            <Row
              label={t('chatGen.paramResolution')}
              options={resolutionOptions.map((option) => ({ value: option, label: option }))}
              value={params.resolution ?? resolutionOptions[0]!}
              onChange={(value) => onChange({ ...params, resolution: value })}
            />
          ) : null}
        </PopButton>
      ) : null}
      {hasIdeas ? <IdeasDialog intent={intent} open={ideasOpen} onClose={() => setIdeasOpen(false)} onUse={onUseTemplate} /> : null}
    </>
  );
}

/** Credit estimate for the armed generation, shown next to the send button. */
export function GenerationCreditsBadge({ intent, params, models }: { intent: GenerationIntent; params: GenerationParams; models: { id: string; name: string }[] }) {
  const modelId = params.modelId ?? models[0]?.id ?? '';
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
  if (credits == null) return null;
  return <span className="text-ink-4 text-[10.5px] tabular-nums">{t('chatGen.estimatedCredits', { n: credits })}</span>;
}
