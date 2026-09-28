'use client';

/**
 * The confirm list: what the agent handed over for the creator to decide (facts it could not
 * verify, music, voice). Each item is confirmed as is or changed in the creator's words; the
 * answer is stored in the project, so the agent reads it back on its next turn.
 */

import { useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import type { HandoffItem } from '@pireel/studio-engine/editor-document/types';
import { t } from './i18n';

export type ConfirmAnswer = (id: string, status: HandoffItem['status'], answer?: string) => void;

const LINK = 'text-ink-3 hover:text-ink text-[11px] underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline';

function ConfirmItem({ item, onAnswer }: { item: HandoffItem; onAnswer: ConfirmAnswer }) {
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

export function ConfirmList({ items, onAnswer }: { items: HandoffItem[]; onAnswer: ConfirmAnswer }) {
  return (
    <div className="flex flex-col">
      <div className="text-ink-4 text-[10.5px] leading-4">{t('panels.confirmHint')}</div>
      <ul className="divide-line mt-1 divide-y">
        {items.map((item) => <ConfirmItem key={`${item.id}:${item.status}`} item={item} onAnswer={onAnswer} />)}
      </ul>
    </div>
  );
}
