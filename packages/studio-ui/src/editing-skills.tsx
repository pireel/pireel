'use client';

/**
 * Editing skills, above the chat composer: a row of the switched-on skills as stacked tiles (plus
 * the confirm list when the agent left one), and a dialog to pick them. The choice lives in the
 * project document, so every agent that edits this project applies the same switches.
 */

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { AudioLines, Captions, Plus, Scissors, Shapes, Volume2 } from 'lucide-react';
import { EDITING_SKILLS, type EditingSkillId } from '@pireel/studio-engine/editing-skills';
import type { HandoffItem } from '@pireel/studio-engine/editor-document/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pireel/ui/dialog';
import { Switch } from '@pireel/ui/switch';
import { ConfirmList, type ConfirmAnswer } from './confirm-list';
import { studioLocale, t } from './i18n';

const LOOK: Record<EditingSkillId, { icon: ComponentType<{ size?: number; className?: string }>; tile: string }> = {
  graphics: { icon: Shapes, tile: 'linear-gradient(135deg,#7dd3fc,#6366f1)' },
  captions: { icon: Captions, tile: 'linear-gradient(135deg,#60a5fa,#0ea5e9)' },
  'rough-cut': { icon: Scissors, tile: 'linear-gradient(135deg,#fdba74,#f97316)' },
  'voice-cleanup': { icon: AudioLines, tile: 'linear-gradient(135deg,#475569,#1e293b)' },
  sound: { icon: Volume2, tile: 'linear-gradient(135deg,#f9a8d4,#db2777)' },
};

function Tile({ id, size = 28, ring, z }: { id: EditingSkillId; size?: number; ring?: boolean; z?: number }) {
  const { icon: Icon, tile } = LOOK[id];
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-[28%] text-white ${ring ? 'ring-2 ring-[var(--color-canvas)]' : ''}`}
      style={{ width: size, height: size, background: tile, ...(z !== undefined ? { zIndex: z } : {}) }}
    >
      <Icon size={Math.round(size * 0.52)} />
    </span>
  );
}

/** Message keys are slugs: ids like `rough-cut` read as `rough_cut`. */
const key = (id: EditingSkillId, field: 'name' | 'short' | 'detail') => `editingSkills.${id.replace(/-/g, '_')}.${field}`;
const name = (id: EditingSkillId) => t(key(id, 'name'));

export function EditingSkillsDialog({ open, value, onClose, onApply }: {
  open: boolean;
  value: readonly string[];
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(value));
  const [focus, setFocus] = useState<EditingSkillId>(EDITING_SKILLS[0].id);
  const [imageOk, setImageOk] = useState(true);
  useEffect(() => { if (open) setDraft(new Set(value)); }, [open, value]);
  useEffect(() => { setImageOk(true); }, [focus]);
  const toggle = (id: string, on: boolean) => setDraft((cur) => {
    const next = new Set(cur);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const changed = draft.size !== value.length || value.some((id) => !draft.has(id));
  const on = draft.has(focus);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="bg-panel border-line flex h-[min(560px,calc(100vh-4rem))] w-[min(880px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <div className="px-5 pt-5 pb-3 pr-12">
          <DialogTitle className="text-ink text-[16px]">{t('editingSkills.title')}</DialogTitle>
          <DialogDescription className="text-ink-3 mt-1 text-[12px]">{t('editingSkills.subtitle')}</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 gap-4 px-4 pb-2">
          <ul className="flex w-[280px] shrink-0 flex-col gap-1 overflow-y-auto">
            {EDITING_SKILLS.map(({ id }) => (
              <li key={id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocus(id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFocus(id); } }}
                  className={`focus-visible:ring-line-2 flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-1 ${focus === id ? 'bg-panel-2/70' : 'hover:bg-panel-2/40'}`}
                >
                  <Tile id={id} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[12.5px] font-medium">{name(id)}</span>
                    <span className="text-ink-4 block truncate text-[11px]">{t(key(id, 'short'))}</span>
                  </span>
                  <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Switch checked={draft.has(id)} aria-label={name(id)} onCheckedChange={(next) => toggle(id, next)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-ink text-[18px] font-semibold">{name(focus)}</div>
              <div className={`flex items-center gap-1.5 text-[11.5px] ${on ? 'text-ink' : 'text-ink-4'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-ink-4/50'}`} />
                {on ? t('editingSkills.on') : t('editingSkills.off')}
              </div>
            </div>
            <p className="text-ink-3 mt-2 text-[12.5px] leading-relaxed">{t(key(focus, 'detail'))}</p>
            {imageOk && (
              <img
                key={focus}
                src={`/studio/editing-skills/${focus}${studioLocale() === 'zh' ? '' : '-en'}.jpg`}
                alt=""
                onError={() => setImageOk(false)}
                className="bg-panel-2 mt-4 aspect-[2/1] w-full rounded-xl object-cover"
              />
            )}
          </div>
        </div>
        <div className="border-line flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink rounded-md px-3 py-1.5 text-[12px]">{t('panels.cancel')}</button>
          <button
            type="button"
            disabled={!changed}
            onClick={() => { onApply(EDITING_SKILLS.map((skill) => skill.id).filter((id) => draft.has(id))); onClose(); }}
            className="bg-ink text-canvas rounded-md px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-40"
          >
            {t('editingSkills.apply', { n: draft.size })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The confirm-list chip and its panel (opens upward over the thread; outside click or Escape closes). */
function ConfirmPopover({ handoff, pending, onAnswer }: { handoff: HandoffItem[]; pending: number; onAnswer: ConfirmAnswer }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={root} className="relative ml-auto">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((cur) => !cur)}
        className={`hover:bg-panel-2/60 hover:text-ink flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] transition-colors ${open ? 'bg-panel-2/60 text-ink' : 'text-ink-3'}`}
      >
        {t('panels.confirmTitle')}
        {pending > 0 && <span className="bg-accent/12 text-accent rounded-full px-1.5 text-[10.5px] tabular-nums">{pending}</span>}
      </button>
      {open && (
        <div className="bg-panel border-line absolute right-0 bottom-full z-30 mb-1.5 max-h-[60vh] w-[320px] overflow-y-auto rounded-xl border p-3 shadow-xl">
          <div className="text-ink mb-1 text-[12.5px] font-medium">{t('panels.confirmTitle')}</div>
          <ConfirmList items={handoff} onAnswer={onAnswer} />
        </div>
      )}
    </div>
  );
}

/** The row above the composer: switched-on skills as stacked tiles, and the confirm list when there is one. */
export function EditingSkillsBar({ value, onChange, handoff, onAnswer }: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  handoff: HandoffItem[];
  onAnswer: ConfirmAnswer;
}) {
  const [open, setOpen] = useState(false);
  const on = EDITING_SKILLS.filter((skill) => value.includes(skill.id));
  const pending = handoff.filter((item) => item.status === 'open').length;
  return (
    <div className="mb-1.5 flex items-center gap-2 px-0.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={on.length ? on.map((skill) => name(skill.id)).join(' · ') : t('editingSkills.title')}
        className="hover:bg-panel-2/60 text-ink-3 hover:text-ink flex h-8 items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-[11.5px] transition-colors"
      >
        {on.length ? (
          <span className="flex items-center -space-x-1">
            {/* The first skill sits on top, so each tile shows its left edge and icon. */}
            {on.map((skill, index) => <Tile key={skill.id} id={skill.id} size={22} ring z={on.length - index} />)}
          </span>
        ) : (
          <span className="border-line-2 text-ink-4 flex h-[22px] w-[22px] items-center justify-center rounded-full border border-dashed">
            <Plus size={12} />
          </span>
        )}
        <span>{on.length ? t('editingSkills.count', { n: on.length }) : t('editingSkills.title')}</span>
      </button>
      {handoff.length > 0 && <ConfirmPopover handoff={handoff} pending={pending} onAnswer={onAnswer} />}
      <EditingSkillsDialog open={open} value={value} onClose={() => setOpen(false)} onApply={onChange} />
    </div>
  );
}
