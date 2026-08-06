'use client';

import { useMemo, useRef, type RefObject } from 'react';
import {
  Check,
  Clapperboard,
  GalleryHorizontalEnd,
  MonitorPlay,
  Scissors,
  ShoppingBag,
  Shuffle,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import {
  STUDIO_AUTO_SKILL_ID,
  STUDIO_SCENARIO_SKILLS,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import { t } from './i18n';

interface SkillOption {
  id: StudioScenarioSkillId;
  icon: LucideIcon;
  label: string;
  summary: string;
}

const ICONS: Record<StudioScenarioSkillId, LucideIcon> = {
  auto: WandSparkles,
  'talking-head-edit': Scissors,
  'long-to-shorts': GalleryHorizontalEnd,
  'montage-edit': Clapperboard,
  'batch-remix': Shuffle,
  'commerce-video': ShoppingBag,
  'product-demo': MonitorPlay,
};

const MESSAGE_IDS: Record<StudioScenarioSkillId, string> = {
  auto: 'auto',
  'talking-head-edit': 'talkingHeadEdit',
  'long-to-shorts': 'longToShorts',
  'montage-edit': 'montageEdit',
  'batch-remix': 'batchRemix',
  'commerce-video': 'commerceVideo',
  'product-demo': 'productDemo',
};

const skillLabel = (id: StudioScenarioSkillId) => t(`chatGen.skill.${MESSAGE_IDS[id]}.title`);
const skillSummary = (id: StudioScenarioSkillId) => t(`chatGen.skill.${MESSAGE_IDS[id]}.summary`);

export function ChatSkillPicker({
  editorRef,
  skillId,
  disabled,
  onChange,
}: {
  editorRef: RefObject<HTMLElement | null>;
  skillId: StudioScenarioSkillId;
  disabled?: boolean;
  onChange: (id: StudioScenarioSkillId) => void;
}) {
  const popoverRef = useRef<TriggerPopoverHandle>(null);
  const options = useMemo<SkillOption[]>(
    () => [
      {
        id: STUDIO_AUTO_SKILL_ID,
        icon: ICONS.auto,
        label: skillLabel(STUDIO_AUTO_SKILL_ID),
        summary: skillSummary(STUDIO_AUTO_SKILL_ID),
      },
      ...STUDIO_SCENARIO_SKILLS.map((skill) => ({
        id: skill.id,
        icon: ICONS[skill.id],
        label: skillLabel(skill.id),
        summary: skillSummary(skill.id),
      })),
    ],
    [],
  );
  const selected = options.find((item) => item.id === skillId) ?? options[0]!;
  const SelectedIcon = selected.icon;

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
        <SelectedIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
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
          const Icon = item.icon;
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
                <Icon size={14} strokeWidth={2.2} />
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
