'use client';

/**
 * AI Enhance: one switch per outcome, not per tool. Turning a switch on does the whole thing
 * (graphics run the video-graphics skill in chat, where the work stays visible; captions and
 * denoise run locally); turning it off takes that outcome back out. What the agent handed over
 * for the creator to confirm (facts, music, voice) sits under the switches, answered in place.
 */

import { useState, type ReactNode } from 'react';
import { AudioLines, Captions, Check, Shapes, Undo2 } from 'lucide-react';
import type { HandoffItem } from '@pireel/studio-engine/editor-document/types';
import { Switch } from '@pireel/ui/switch';
import { t } from './i18n';

export interface AiEnhancePanelProps {
  /** A video is on the timeline: every switch acts on footage. */
  hasFootage: boolean;
  graphics: { count: number; running: boolean };
  onGraphics: (mode: 'full' | 'key' | 'redo') => void;
  onRemoveGraphics: () => void;
  captions: { on: boolean; busy: boolean };
  onCaptions: (on: boolean) => void;
  denoise: { strength: number | null; status: 'baking' | 'ready' | 'failed' | 'silent' | null; progress: number };
  onSetDenoise: (strength: number | null) => void;
  /** An agent turn is running: switches that start one wait. */
  agentBusy: boolean;
  handoff: HandoffItem[];
  onAnswer: (id: string, status: HandoffItem['status'], answer?: string) => void;
}

function Row({ icon, title, hint, control, children }: { icon: ReactNode; title: string; hint: string; control: ReactNode; children?: ReactNode }) {
  return (
    <section className="border-line border-b px-3.5 py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <div className="bg-panel text-ink-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-ink text-[12.5px] font-medium">{title}</div>
          <div className="text-ink-4 mt-0.5 text-[11px] leading-4">{hint}</div>
        </div>
        <div className="shrink-0 pt-0.5">{control}</div>
      </div>
      {children ? <div className="mt-2 flex flex-col gap-1.5 pl-[38px]">{children}</div> : null}
    </section>
  );
}

const NOTE = 'text-ink-4 text-[10.5px] leading-4';
const LINK = 'text-ink-3 hover:text-ink text-[11px] underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline';

function ConfirmItem({ item, onAnswer }: { item: HandoffItem; onAnswer: AiEnhancePanelProps['onAnswer'] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.answer ?? '');
  const kind = t(`panels.confirmKind.${item.kind}`);
  const save = () => {
    const text = draft.trim();
    if (text) onAnswer(item.id, 'changed', text);
    setEditing(false);
  };
  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start gap-2">
        <span className="bg-panel text-ink-3 shrink-0 rounded px-1.5 py-0.5 text-[10px]">{kind}</span>
        <span className={`min-w-0 flex-1 text-[11.5px] leading-[18px] ${item.status === 'open' ? 'text-ink' : 'text-ink-4'}`}>{item.text}</span>
      </div>
      {item.status === 'open' && !editing && (
        <div className="flex items-center gap-3 pl-1">
          <button type="button" onClick={() => onAnswer(item.id, 'confirmed')} className="bg-panel hover:bg-panel-2/70 text-ink flex items-center gap-1 rounded-md px-2 py-1 text-[11px]">
            <Check size={11} />
            {t('panels.confirmAccept')}
          </button>
          <button type="button" onClick={() => setEditing(true)} className={LINK}>{t('panels.confirmChange')}</button>
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-1.5">
          <textarea
            autoFocus
            value={draft}
            rows={2}
            placeholder={t('panels.confirmChangePlaceholder')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }}
            className="bg-panel text-ink placeholder:text-ink-4 focus:ring-line-2 w-full resize-none rounded-md px-2 py-1.5 text-[11.5px] outline-none focus:ring-1"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={!draft.trim()} className="bg-panel hover:bg-panel-2/70 text-ink rounded-md px-2 py-1 text-[11px] disabled:opacity-40">{t('panels.confirmSave')}</button>
            <button type="button" onClick={() => setEditing(false)} className={LINK}>{t('panels.cancel')}</button>
          </div>
        </div>
      )}
      {item.status !== 'open' && (
        <div className="flex items-center gap-2 pl-1">
          <span className="text-ink-3 min-w-0 flex-1 truncate text-[11px]">
            {item.status === 'confirmed' ? t('panels.confirmConfirmed') : t('panels.confirmChanged', { answer: item.answer ?? '' })}
          </span>
          <button type="button" onClick={() => onAnswer(item.id, 'open')} aria-label={t('panels.confirmReopen')} title={t('panels.confirmReopen')} className="text-ink-4 hover:text-ink rounded p-1">
            <Undo2 size={12} />
          </button>
        </div>
      )}
    </li>
  );
}

export function AiEnhancePanel({ hasFootage, graphics, onGraphics, onRemoveGraphics, captions, onCaptions, denoise, onSetDenoise, agentBusy, handoff, onAnswer }: AiEnhancePanelProps) {
  const graphicsOn = graphics.count > 0;
  const open = handoff.filter((item) => item.status === 'open').length;
  return (
    <div data-block-selection-keep className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="text-ink px-3.5 pt-3 pb-1 text-[13px] font-semibold">{t('panels.aiEnhance')}</div>
      {!hasFootage && <div className={`${NOTE} px-3.5 pb-1`}>{t('panels.enhanceNeedsFootage')}</div>}

      <Row
        icon={<Shapes size={14} />}
        title={t('panels.enhanceGraphics')}
        hint={t('panels.enhanceGraphicsHint')}
        control={(
          <Switch
            checked={graphicsOn || graphics.running}
            disabled={!hasFootage || graphics.running || (!graphicsOn && agentBusy)}
            aria-label={t('panels.enhanceGraphics')}
            onCheckedChange={(checked) => (checked ? onGraphics('full') : onRemoveGraphics())}
          />
        )}
      >
        {graphics.running ? (
          <div className={NOTE}>{t('panels.enhanceRunning')}</div>
        ) : graphicsOn ? (
          <div className="flex items-center gap-3">
            <span className={NOTE}>{t('panels.enhanceGraphicsCount', { n: graphics.count })}</span>
            <button type="button" disabled={agentBusy} onClick={() => onGraphics('redo')} className={LINK}>{t('panels.enhanceRedo')}</button>
          </div>
        ) : (
          <button type="button" disabled={!hasFootage || agentBusy} onClick={() => onGraphics('key')} className={`${LINK} self-start`}>{t('panels.enhanceGraphicsKey')}</button>
        )}
      </Row>

      <Row
        icon={<Captions size={14} />}
        title={t('panels.enhanceCaptions')}
        hint={t('panels.enhanceCaptionsHint')}
        control={(
          <Switch
            checked={captions.on || captions.busy}
            disabled={!hasFootage || captions.busy}
            aria-label={t('panels.enhanceCaptions')}
            onCheckedChange={(checked) => onCaptions(checked)}
          />
        )}
      >
        {captions.busy ? <div className={NOTE}>{t('panels.enhanceCaptionsBusy')}</div> : null}
      </Row>

      <Row
        icon={<AudioLines size={14} />}
        title={t('panels.denoiseNarration')}
        hint={t('panels.enhanceDenoiseHint')}
        control={(
          <Switch
            checked={denoise.strength != null}
            disabled={!hasFootage}
            aria-label={t('panels.denoiseNarration')}
            onCheckedChange={(checked) => onSetDenoise(checked ? 0.6 : null)}
          />
        )}
      >
        {denoise.strength != null ? (
          <>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-ink-3 w-7 shrink-0">{t('panels.denoiseStrength')}</span>
              <input
                key={denoise.strength}
                type="range"
                min={10}
                max={100}
                step={5}
                defaultValue={Math.round(denoise.strength * 100)}
                onPointerUp={(e) => onSetDenoise(Number((e.target as HTMLInputElement).value) / 100)}
                onKeyUp={(e) => onSetDenoise(Number((e.target as HTMLInputElement).value) / 100)}
                className="zoom-range w-full"
                aria-label={t('panels.denoiseStrength')}
              />
              <span className="text-ink-4 w-8 shrink-0 text-right tabular-nums">{Math.round(denoise.strength * 100)}%</span>
            </div>
            {denoise.status === 'baking' && <div className={NOTE}>{t('panels.denoiseBaking', { pct: Math.round(denoise.progress * 100) })}</div>}
            {denoise.status === 'failed' && <div className={NOTE}>{t('panels.denoiseFailedHint')}</div>}
            {denoise.status === 'silent' && <div className={NOTE}>{t('panels.denoiseSilentHint')}</div>}
            {denoise.status === 'ready' && <div className={NOTE}>{t('panels.denoiseReadyHint')}</div>}
          </>
        ) : null}
      </Row>

      {handoff.length > 0 && (
        <section className="border-line mt-1 border-t px-3.5 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-ink text-[12.5px] font-medium">{t('panels.confirmTitle')}</span>
            {open > 0 && <span className="bg-accent/12 text-accent rounded-full px-1.5 text-[10.5px] tabular-nums">{open}</span>}
          </div>
          <div className={`${NOTE} mt-0.5`}>{t('panels.confirmHint')}</div>
          <ul className="divide-line mt-1 divide-y">
            {handoff.map((item) => <ConfirmItem key={`${item.id}:${item.status}`} item={item} onAnswer={onAnswer} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
