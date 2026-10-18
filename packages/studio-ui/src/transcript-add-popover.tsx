'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { t } from '@pireel/studio-ui/i18n';
import type { GenerationIntent, GenerationParams } from '@pireel/studio-ui/chat-generation-intent';
import { GenerationControls, GenerationCreditsBadge } from '@pireel/studio-ui/chat-generation-params';
import { generationRequest, loadGenerationParams, saveGenerationParams, useGenerationModels, withKnownModel, type GenerationRequest } from '@pireel/studio-ui/generation-settings';

export type TranscriptAddPopoverKind = 'sticker' | 'media' | 'sfx' | 'mg';
/** What an AI tab generates. */
export type TranscriptAddGenKind = 'mg' | 'sticker' | 'image' | 'video' | 'sfx';

export interface TranscriptAddTarget {
  kind: TranscriptAddPopoverKind;
  text: string;
  startSec: number;
  endSec: number;
  before: string;
  after: string;
  left: number;
  top: number;
}

type Tab = { id: string; label: string; gen?: TranscriptAddGenKind };

const TABS: Record<TranscriptAddPopoverKind, Tab[]> = {
  sticker: [{ id: 'library', label: 'captions.addTabStickers' }, { id: 'ai', label: 'captions.addTabAi', gen: 'sticker' }],
  media: [{ id: 'library', label: 'captions.addTabMine' }, { id: 'ai-image', label: 'captions.addTabAiImage', gen: 'image' }, { id: 'ai-video', label: 'captions.addTabAiVideo', gen: 'video' }],
  sfx: [{ id: 'library', label: 'captions.addTabAudio' }, { id: 'ai', label: 'captions.addTabAi', gen: 'sfx' }],
  mg: [{ id: 'library', label: 'captions.addTabComponents' }, { id: 'ai', label: 'captions.addTabAi', gen: 'mg' }],
};

const WIDTH = 380;

/**
 * "Add over this selection" popover: pick from the library in place, or let AI draft a prompt from
 * the selected line and its context, edit it, and generate straight onto the selection's time range.
 */
export function TranscriptAddPopover({ target, library, draftPrompt, onGenerate, onClose }: {
  target: TranscriptAddTarget;
  /** In-place library for this kind (stickers / my assets); absent = AI only. */
  library?: ReactNode;
  draftPrompt?: (req: { kind: TranscriptAddGenKind; text: string; before: string; after: string; durationSec: number }) => Promise<string>;
  /** Confirmed prompt: the host generates and inserts over the selection, then this popover closes.
   *  request = the chosen settings mapped for the generation call (absent for MG). */
  onGenerate: (kind: TranscriptAddGenKind, prompt: string, request?: GenerationRequest) => void;
  onClose: () => void;
}) {
  const tabs = TABS[target.kind].filter((tab) => tab.gen || library);
  const [tab, setTab] = useState(tabs[0]!.id);
  const current = tabs.find((candidate) => candidate.id === tab) ?? tabs[0]!;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const node = event.target as Node;
      // Library panels open their own portalled menus/lightboxes; only clicks on the page proper close us.
      if (rootRef.current?.contains(node) || (node instanceof Element && node.closest('[data-floating-layer],[data-radix-popper-content-wrapper],[role="dialog"],[role="menu"]'))) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('mousedown', outside); window.removeEventListener('keydown', escape); };
  }, [onClose]);
  const left = Math.max(12, Math.min(target.left, window.innerWidth - WIDTH - 12));
  const top = Math.max(12, Math.min(target.top, window.innerHeight - 480));
  const range = `${target.startSec.toFixed(1)}–${target.endSec.toFixed(1)}s`;
  return createPortal(
    <div ref={rootRef} data-transcript-add-popover className="border-line bg-panel text-ink fixed z-[110] flex max-h-[min(520px,calc(100vh-24px))] flex-col overflow-hidden rounded-lg border shadow-2xl" style={{ left, top, width: WIDTH }}>
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 pt-1.5">
        {tabs.map((candidate) => <button key={candidate.id} type="button" aria-pressed={candidate.id === current.id} onClick={() => setTab(candidate.id)}
          className={`-mb-px flex items-center gap-1 border-b-2 px-2 pb-1.5 text-[11.5px] ${candidate.id === current.id ? 'border-ink text-ink font-medium' : 'text-ink-4 border-transparent hover:text-ink'}`}>
          {candidate.gen && <Sparkles size={11} />}{t(candidate.label)}
        </button>)}
        <span className="text-ink-4 ml-auto truncate pb-1.5 font-mono text-[10.5px] tabular-nums">{range}</span>
        <button type="button" aria-label={t('workbench.close')} onClick={onClose} className="text-ink-3 hover:bg-panel-2 mb-1 rounded p-1"><X size={13} /></button>
      </div>
      {current.gen
        ? <AiTab key={current.gen} kind={current.gen} target={target} draftPrompt={draftPrompt} onGenerate={(prompt, request) => { onGenerate(current.gen!, prompt, request); onClose(); }} />
        : <div className="flex h-[440px] min-h-0 flex-col">{library}</div>}
    </div>,
    window.document.body,
  );
}

const INTENT: Partial<Record<TranscriptAddGenKind, GenerationIntent>> = { image: 'image', sticker: 'image', video: 'video', sfx: 'audio' };

/** Settings this surface starts from: the chat's remembered choices, fitted to the kind. */
function initialParams(kind: TranscriptAddGenKind): GenerationParams {
  const remembered = loadGenerationParams();
  if (kind === 'sticker') return { ...remembered, ratio: '1:1', count: 1 };
  if (kind === 'image') return { ...remembered, count: 1 };
  if (kind === 'sfx') return remembered.audioKind === 'music' ? remembered : { ...remembered, audioKind: 'sfx', voiceId: undefined, durationSec: remembered.audioKind === 'sfx' ? remembered.durationSec : 5 };
  return remembered;
}

function AiTab({ kind, target, draftPrompt, onGenerate }: {
  kind: TranscriptAddGenKind;
  target: TranscriptAddTarget;
  draftPrompt?: (req: { kind: TranscriptAddGenKind; text: string; before: string; after: string; durationSec: number }) => Promise<string>;
  onGenerate: (prompt: string, request?: GenerationRequest) => void;
}) {
  const intent = INTENT[kind] ?? null;
  const [params, setParams] = useState<GenerationParams>(() => initialParams(kind));
  const models = useGenerationModels(intent, (loaded) => setParams((current) => withKnownModel(current, loaded)));
  const changeParams = (next: GenerationParams) => { setParams(next); saveGenerationParams(next); };
  const [prompt, setPrompt] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = async () => {
    if (!draftPrompt) return;
    setDrafting(true);
    setError(null);
    try {
      setPrompt(await draftPrompt({ kind, text: target.text, before: target.before, after: target.after, durationSec: target.endSec - target.startSec }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };
  useEffect(() => { void draft(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- draft once per tab
  return <div className="flex flex-col gap-2 p-3">
    {target.text && <div className="text-ink-3 line-clamp-2 text-[11px] leading-relaxed">「{target.text}」</div>}
    <div className="relative">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} disabled={drafting}
        placeholder={t(drafting ? 'captions.draftingPrompt' : 'captions.promptPlaceholder')} aria-label={t('captions.generatePrompt')}
        className="border-line bg-canvas focus:border-ink-3 w-full resize-y rounded-md border px-2.5 py-2 text-[12.5px] leading-relaxed outline-none disabled:opacity-60" />
      {drafting && <Loader2 size={14} className="text-ink-3 absolute right-2 top-2 animate-spin" />}
    </div>
    {error && <p className="text-[11px] text-[#e5484d]">{error}</p>}
    <div className="flex items-center gap-2">
      {intent && <GenerationControls intent={intent} params={params} models={models} audioKinds={['sfx', 'music']} onChange={changeParams} onUseTemplate={setPrompt} />}
      {draftPrompt && <button type="button" disabled={drafting} onClick={() => void draft()} title={t('captions.redraftPrompt')} className="text-ink-3 hover:text-ink flex items-center gap-1 text-[11px] disabled:opacity-40"><RefreshCw size={11} />{t('captions.redraftPrompt')}</button>}
      <span className="ml-auto">{intent ? <GenerationCreditsBadge intent={intent} params={params} models={models} /> : <span className="text-ink-4 text-[10.5px]">{t('captions.generateCostsCredits')}</span>}</span>
      <button type="button" disabled={drafting || !prompt.trim()} onClick={() => onGenerate(prompt.trim(), intent ? generationRequest(intent, params, models) : undefined)}
        className="bg-primary text-primary-foreground flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] disabled:opacity-40"><Sparkles size={12} />{t('captions.generateInsert')}</button>
    </div>
  </div>;
}
