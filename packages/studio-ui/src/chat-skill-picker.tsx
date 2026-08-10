'use client';

import { useMemo, useRef, type RefObject } from 'react';
import { Check, WandSparkles } from 'lucide-react';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import type { StudioScenarioSkillOption } from './shell-context';
import { t } from './i18n';

interface SkillOption {
  id: StudioScenarioSkillId;
  icon?: string;
  label: string;
  summary: string;
  automatic?: boolean;
}

function SkillMark({ option, compact = false }: { option: SkillOption; compact?: boolean }) {
  if (option.automatic) {
    return <WandSparkles className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.2} />;
  }
  return (
    <span className={compact ? 'text-[13px] leading-none' : 'text-[15px] leading-none'} aria-hidden>
      {option.icon ?? '✦'}
    </span>
  );
}

export function ChatSkillPicker({
  editorRef,
  skillId,
  skills,
  disabled,
  onChange,
}: {
  editorRef: RefObject<HTMLElement | null>;
  skillId: StudioScenarioSkillId;
  skills: readonly StudioScenarioSkillOption[];
  disabled?: boolean;
  onChange: (id: StudioScenarioSkillId) => void;
}) {
  const popoverRef = useRef<TriggerPopoverHandle>(null);
  const options = useMemo<SkillOption[]>(
    () => [
      {
        id: STUDIO_AUTO_SKILL_ID,
        label: t('chatGen.skill.auto.title'),
        summary: t('chatGen.skill.auto.summary'),
        automatic: true,
      },
      ...skills.map((skill) => ({
        id: skill.id,
        icon: skill.icon,
        label: skill.title,
        summary: skill.summary,
      })),
    ],
    [skills],
  );
  const selected = options.find((item) => item.id === skillId) ?? options[0]!;

  // No host catalog means there is nothing useful to choose: keep OSS automatic routing visually quiet.
  if (options.length === 1) return null;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => popoverRef.current?.open(event.currentTarget)}
        title={t('chatGen.skillCurrent', { title: selected.label })}
        aria-label={t('chatGen.skillCurrent', { title: selected.label })}
        className={`inline-flex h-7 max-w-[124px] items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
          skillId === STUDIO_AUTO_SKILL_ID
            ? 'text-ink-3 hover:bg-line hover:text-ink'
            : 'bg-accent/12 text-accent hover:bg-accent/20'
        }`}
      >
        <SkillMark option={selected} compact />
        <span className="truncate">{selected.label}</span>
      </button>

      <TriggerPopover<SkillOption>
        ref={popoverRef}
        editorRef={editorRef}
        enabled={!disabled}
        items={options}
        itemSearchText={(item) => `${item.label} ${item.summary}`}
        itemKey={(item) => item.id}
        title={t('chatGen.pickSkillN', { n: options.length })}
        initialActiveKey={skillId}
        className="w-[330px]"
        onPick={(item) => onChange(item.id)}
        renderItem={(item, { active, pick, setActive }) => {
          const selectedItem = item.id === skillId;
          return (
            <button
              type="button"
              data-active={active || undefined}
              onMouseEnter={setActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={pick}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left ${active ? 'bg-panel-2' : ''}`}
            >
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${selectedItem ? 'bg-accent/12 text-accent' : 'bg-panel-2 text-ink-3'}`}>
                <SkillMark option={item} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-ink truncate text-[12.5px] font-medium">{item.label}</span>
                  {selectedItem && <Check size={12} className="text-accent shrink-0" strokeWidth={2.5} />}
                </span>
                <span className="text-ink-4 mt-0.5 line-clamp-2 text-[11px] leading-snug">{item.summary}</span>
              </span>
            </button>
          );
        }}
      />
    </>
  );
}
