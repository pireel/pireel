'use client';

/**
 * Toolbar controls of the composer's generation modes — the configuration the retired generation
 * panel held, collapsed into icons on the input's bottom row (like the theme button in Agent mode):
 *  - Ideas: a large dialog of template cards (image/video previews, prompt cards for audio/graphics);
 *  - Settings: a popover with model (image/video), aspect / count / quality (image), aspect /
 *    duration / resolution (video), voice + a duration ladder (audio: short = sfx, long = music).
 * The credit estimate (useQuote) renders next to the send button. Options come from the same sources
 * as before (`/api/models?kind=…`, the shell's per-model tables); the chosen values ride in the
 * message's intent line.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, Play, Search, SlidersHorizontal } from 'lucide-react';
import { useQuote } from '@pireel/ui/use-quote';
import { imageThumb } from '@pireel/ui/image-url';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { useStudioShell } from './shell-context';
import { studioLocale, t } from './i18n';
import { audioKindFor, generationTemplates, MUSIC_DURATION_OPTIONS, SFX_DURATION_OPTIONS, type AudioKind, type GenerationIntent, type GenerationParams } from './chat-generation-intent';

const RATIOS: NonNullable<GenerationParams['ratio']>[] = ['9:16', '16:9', '1:1'];
const TOOL_BUTTON = 'text-ink-3 hover:bg-line hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-30';

/** Five-second ceiling tiers of the SFX billing row (same as the server's sfxDurationTier). */
function sfxDurationTier(durationSec: number): 's5' | 's10' | 's15' | 's22' {
  if (durationSec <= 5) return 's5';
  if (durationSec <= 10) return 's10';
  if (durationSec <= 15) return 's15';
  return 's22';
}

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
  const templates = useMemo(() => generationTemplates(intent, studioLocale(), 60), [intent]);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? templates.filter((template) => `${template.title} ${template.prompt}`.toLocaleLowerCase().includes(needle)) : templates;
  }, [templates, query]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="bg-panel border-line w-[min(1120px,calc(100vw-2rem))] gap-3 p-4">
        <DialogHeader className="pr-7">
          <DialogTitle className="text-ink text-[14px]">{t('chatGen.templates')}</DialogTitle>
        </DialogHeader>
        <label className="border-line focus-within:border-accent relative block rounded-md border">
          <Search size={12} className="text-ink-4 pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('chatGen.searchIdeas')}
            aria-label={t('chatGen.searchIdeas')}
            className="text-ink placeholder:text-ink-4 h-7 w-full bg-transparent pl-7 pr-2 text-[12px] outline-none"
          />
        </label>
        <div className="grid max-h-[78vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
          {shown.map((template) => (
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
  // Voices for the audio mode: choosing one turns the message into a narration script.
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (intent !== 'audio') return;
    let cancelled = false;
    void fetch('/api/studio/voices?limit=50')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { voices?: Array<Record<string, unknown>> } | null) => {
        if (cancelled || !Array.isArray(j?.voices)) return;
        setVoices(j.voices
          .filter((voice) => typeof voice.id === 'string')
          .map((voice) => ({ id: String(voice.id), name: String(voice.name ?? voice.label ?? voice.id) })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [intent]);
  const audioKind = intent === 'audio' ? audioKindFor(params) : null;
  const modelId = params.modelId ?? models[0]?.id ?? '';
  const qualityCfg = intent === 'image' ? (shell.modelParams?.qualityConfigFor(modelId) ?? null) : null;
  const resolutionOptions = intent === 'video' ? (shell.modelParams?.videoResolutionOptions(modelId) ?? []) : [];
  const durationOptions = intent === 'video'
    ? (shell.modelParams?.videoDurationOptions(modelId) ?? ['5', '10'])
    : intent === 'audio'
      ? (audioKind === 'music' ? MUSIC_DURATION_OPTIONS : SFX_DURATION_OPTIONS).map(String)
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
      // Arming audio settles the explicit kind (default: sound effect, never speech) and a valid
      // duration for that kind; speech is timed by its text so it carries no duration.
      const kind = params.audioKind ?? 'sfx';
      const patch: Partial<GenerationParams> = {};
      if (params.audioKind == null) patch.audioKind = kind;
      if (kind !== 'speech' && (!params.durationSec || !durationOptions.includes(String(params.durationSec)))) {
        patch.durationSec = kind === 'music' ? 60 : 5;
      }
      if (Object.keys(patch).length) onChange({ ...params, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, modelId]);

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
          {intent === 'audio' ? (
            <Row
              label={t('chatGen.paramAudioKind')}
              options={[
                { value: 'sfx', label: t('chatGen.audioKindSfx') },
                { value: 'music', label: t('chatGen.audioKindMusic') },
                { value: 'speech', label: t('chatGen.audioKindSpeech') },
              ]}
              value={audioKind ?? 'sfx'}
              onChange={(value) => {
                const kind = value as AudioKind;
                const next: GenerationParams = { ...params, audioKind: kind };
                // Kind is the source of truth: leaving speech drops the voice; entering a timed kind
                // seeds its default duration; speech carries none (timed by its text).
                if (kind === 'speech') { delete next.durationSec; }
                else { delete next.voiceId; next.durationSec = kind === 'music' ? 60 : 5; }
                onChange(next);
              }}
            />
          ) : null}
          {intent === 'audio' && audioKind === 'speech' && voices.length ? (
            <div className="flex items-center gap-1 py-0.5">
              <span className="text-ink-4 w-12 shrink-0 text-[10.5px]">{t('chatGen.paramVoice')}</span>
              <select
                value={params.voiceId ?? ''}
                onChange={(event) => onChange({ ...params, voiceId: event.target.value || undefined })}
                aria-label={t('chatGen.paramVoice')}
                className="border-line bg-panel text-ink h-6 min-w-0 flex-1 rounded-md border px-1 text-[10.5px] outline-none"
              >
                <option value="">{t('chatGen.voiceNone')}</option>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>{voice.name}</option>
                ))}
              </select>
              {params.voiceId ? (
                <button
                  type="button"
                  title={t('chatGen.previewVoice')}
                  aria-label={t('chatGen.previewVoice')}
                  onClick={() => {
                    const audio = new Audio(`/api/studio/voice-preview?voiceId=${encodeURIComponent(params.voiceId!)}`);
                    void audio.play().catch(() => {});
                  }}
                  className="text-ink-3 hover:text-ink inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                >
                  <Play className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ) : null}
          {intent === 'video' || (intent === 'audio' && audioKind !== 'speech') ? (
            <Row
              label={t('chatGen.paramDuration')}
              options={durationOptions.map((option) => ({ value: option, label: `${option}s` }))}
              value={String(params.durationSec ?? durationOptions[0] ?? '')}
              onChange={(value) => onChange({ ...params, durationSec: Number(value) })}
            />
          ) : null}
          {intent === 'audio' ? (
            <div className="text-ink-4 pt-1 text-[10px]">
              {audioKind === 'speech' ? t('chatGen.audioKindSpeechHint') : audioKind === 'sfx' ? t('chatGen.audioKindSfxHint') : t('chatGen.audioKindMusicHint')}
            </div>
          ) : null}
          {intent === 'video' ? (
            <Row
              label={t('chatGen.paramSound')}
              options={[{ value: 'on', label: t('chatGen.soundOn') }, { value: 'off', label: t('chatGen.soundOff') }]}
              value={params.generateAudio ? 'on' : 'off'}
              onChange={(value) => onChange({ ...params, generateAudio: value === 'on' })}
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
    if (intent === 'audio') {
      const kind = audioKindFor(params);
      if (kind === 'sfx') return { duration_tier: sfxDurationTier(params.durationSec ?? 5) };
      if (kind === 'music') return { tier: 'song' }; // 30 s floor → always the full-track tier
      return {};
    }
    return {};
  }, [intent, params, modelId]);
  const audioKind = intent === 'audio' ? audioKindFor(params) : null;
  const credits = useQuote({
    toolId: intent === 'video' ? 'video-gen' : audioKind === 'music' ? 'music-gen' : audioKind === 'sfx' ? 'sfx-gen' : audioKind === 'speech' ? 'speech-gen-unquoted' : 'image-gen',
    modelId: intent === 'image' || intent === 'video' ? modelId : '',
    params: quoteParams,
  });
  if (audioKind === 'speech') return null; // priced by text length at synthesis time
  if (credits == null) return null;
  return <span className="text-ink-4 text-[10.5px] tabular-nums">{t('chatGen.estimatedCredits', { n: credits })}</span>;
}
