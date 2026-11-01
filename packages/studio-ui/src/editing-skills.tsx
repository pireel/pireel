'use client';

/**
 * Editing skills: their tiles and the switches a not-yet-edited project picks them with. The choice
 * lives in the project document, so every agent that edits this project applies the same switches.
 */

import type { ComponentType } from 'react';
import { AudioLines, Captions, Film, ImageIcon, Scissors, Shapes, Volume2 } from 'lucide-react';
import { EDITING_SKILLS, type EditingSkillId } from '@pireel/studio-engine/editing-skills';
import { Switch } from '@pireel/ui/switch';
import { t } from '@pireel/studio-ui/i18n';

const LOOK: Record<EditingSkillId, { icon: ComponentType<{ size?: number; className?: string }>; tile: string }> = {
  cover: { icon: ImageIcon, tile: '#3f5054' },
  graphics: { icon: Shapes, tile: 'linear-gradient(135deg,#7dd3fc,#6366f1)' },
  captions: { icon: Captions, tile: 'linear-gradient(135deg,#60a5fa,#0ea5e9)' },
  'rough-cut': { icon: Scissors, tile: 'linear-gradient(135deg,#fdba74,#f97316)' },
  'voice-cleanup': { icon: AudioLines, tile: 'linear-gradient(135deg,#475569,#1e293b)' },
  'b-roll': { icon: Film, tile: 'linear-gradient(135deg,#5eead4,#0d9488)' },
  sound: { icon: Volume2, tile: 'linear-gradient(135deg,#f9a8d4,#db2777)' },
};

export function EditingSkillTile({ id, size = 28, ring, z }: { id: EditingSkillId; size?: number; ring?: boolean; z?: number }) {
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
export const editingSkillName = (id: EditingSkillId) => t(`editingSkills.${id.replace(/-/g, '_')}.name`);
const name = editingSkillName;

/** The editing skills as switches, for a project whose footage is not yet edited. */
export function EditingSkillSwitches({ value, onChange, disabled }: { value: readonly string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const toggle = (id: EditingSkillId, on: boolean) => onChange(EDITING_SKILLS.map((skill) => skill.id).filter((skill) => skill === id ? on : value.includes(skill)));
  return (
    <section aria-label={t('editingSkills.title')} className="w-full max-w-[360px] px-2">
      <h3 className="text-ink-3 mb-1.5 px-1 text-[11px] font-medium">{t('editingSkills.title')}</h3>
      <ul className="flex flex-col">
        {EDITING_SKILLS.map(({ id }) => (
          <li key={id}>
            <label className="hover:bg-panel-2/60 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5">
              <EditingSkillTile id={id} size={26} />
              <span className="text-ink-2 min-w-0 flex-1 truncate text-[12.5px]">{name(id)}</span>
              <Switch checked={value.includes(id)} disabled={disabled} aria-label={name(id)} onCheckedChange={(on) => toggle(id, on)} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
