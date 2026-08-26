'use client';

/**
 * ask_user tool card: a structured question with clickable option chips, rendered in the chat.
 * - input-available (awaiting): chips are live; single-select answers on click, multi-select toggles
 *   then a Confirm button submits. Enabled only once a resolver is registered (useHasPendingAsk).
 * - output-available (answered): the chosen option(s) shown highlighted, the rest muted.
 * - output-error (stopped / interrupted on refresh): muted, no chips.
 * The click resolves the parked tool promise via the ask store; the agent continues with the answer.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Pause, Play } from 'lucide-react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { resolveInteraction, usePendingInteraction } from './interaction-store';
import type { ToolPartLike } from './chat-tool-parts';
import { t } from './i18n';

interface AskOption {
  label: string;
  description?: string;
  value?: string;
  previewUrl?: string;
}

export function AskUserCard({ part }: { part: ToolPartLike }) {
  const input = part.input as { question?: unknown; options?: unknown; multiSelect?: unknown } | undefined;
  const question = typeof input?.question === 'string' ? input.question : '';
  const options: AskOption[] = Array.isArray(input?.options)
    ? (input!.options as unknown[])
        .map((o) => {
          const oo = o as { label?: unknown; description?: unknown; value?: unknown; previewUrl?: unknown };
          const previewUrl = typeof oo?.previewUrl === 'string' ? oo.previewUrl.trim().slice(0, 2_000) : '';
          return {
            label: String(oo?.label ?? ''),
            description: typeof oo?.description === 'string' ? oo.description : undefined,
            value: typeof oo?.value === 'string' ? oo.value : undefined,
            previewUrl: /^(https:\/\/|\/voice-previews\/|\/api\/studio\/voice-preview(?:\?|$))/.test(previewUrl) ? previewUrl : undefined,
          };
        })
        .filter((o) => o.label)
    : [];
  const multi = input?.multiSelect === true;

  const answered = part.state === 'output-available';
  const errored = part.state === 'output-error';
  const active = part.state === 'input-available' || part.state === 'input-streaming';
  const hasPending = usePendingInteraction('ask') !== null;
  const live = active && hasPending;

  // Chosen labels from the receipt (answered) so the card reads correctly after the turn / on restore
  const out = part.output as StudioToolResult | undefined;
  const chosen = new Set(
    answered && Array.isArray((out?.data as { selected?: unknown })?.selected)
      ? ((out!.data as { selected: unknown[] }).selected as unknown[]).map(String)
      : [],
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [playingLabel, setPlayingLabel] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => {
    previewRef.current?.pause();
    previewRef.current = null;
  }, []);

  const togglePreview = (option: AskOption) => {
    if (!option.previewUrl) return;
    if (playingLabel === option.label) {
      previewRef.current?.pause();
      previewRef.current = null;
      setPlayingLabel(null);
      return;
    }
    previewRef.current?.pause();
    const audio = new Audio(option.previewUrl);
    previewRef.current = audio;
    setPlayingLabel(option.label);
    audio.addEventListener('ended', () => {
      if (previewRef.current === audio) previewRef.current = null;
      setPlayingLabel((current) => current === option.label ? null : current);
    }, { once: true });
    audio.play().catch(() => {
      if (previewRef.current === audio) previewRef.current = null;
      setPlayingLabel((current) => current === option.label ? null : current);
    });
  };
  const submit = (labels: string[]) => {
    if (!live || !labels.length) return;
    resolveInteraction(labels);
  };
  const onChip = (label: string) => {
    if (!live) return;
    if (multi) {
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        return next;
      });
    } else {
      submit([label]);
    }
  };

  if (!question || !options.length) return null;

  return (
    <div className="border-line bg-panel-2 w-full overflow-hidden rounded-md border">
      <div className="text-ink-2 border-line/70 border-b px-2.5 py-1.5 text-[12px] font-medium leading-relaxed">{question}</div>
      <div className="flex flex-col gap-1 p-1.5">
        {options.map((o) => {
          const isChosen = answered ? chosen.has(o.label) : multi ? picked.has(o.label) : false;
          const clickable = live;
          return (
            <div
              key={o.label}
              className={`flex w-full items-stretch rounded-md border transition-colors ${
                isChosen
                  ? 'border-accent bg-accent/10'
                  : clickable
                    ? 'border-line hover:border-accent/60 hover:bg-accent/5'
                    : 'border-line/60 opacity-60'
              }`}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onChip(o.label)}
                className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-1.5 text-left"
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${isChosen ? 'border-accent bg-accent text-white' : 'border-line'}`}>
                  {isChosen && <Check size={10} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block text-[12px] font-medium">{o.label}</span>
                  {o.description && <span className="text-ink-3 block text-[11px] leading-snug">{o.description}</span>}
                </span>
              </button>
              {o.previewUrl && (
                <button
                  type="button"
                  onClick={() => togglePreview(o)}
                  aria-label={playingLabel === o.label ? '暂停试听' : `试听 ${o.label}`}
                  className="text-ink-3 hover:text-ink border-line/70 grid w-9 shrink-0 place-items-center border-l"
                >
                  {playingLabel === o.label ? <Pause size={14} /> : <Play size={14} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {multi && live && (
        <div className="border-line/70 flex justify-end border-t px-2.5 py-1.5">
          <button
            type="button"
            disabled={!picked.size}
            onClick={() => submit([...picked])}
            className="bg-ink text-bg rounded-md px-3 py-1 text-[12px] hover:opacity-90 disabled:opacity-30"
          >
            {t('workbench.askConfirm')}
          </button>
        </div>
      )}
      {errored && <div className="text-ink-4 border-line/70 border-t px-2.5 py-1 text-[11px]">{part.errorText || t('chatGen.stopped')}</div>}
    </div>
  );
}
