'use client';

import { useMemo, useRef, type RefObject } from 'react';
import { Check } from 'lucide-react';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import type { StudioScenarioSkillOption } from './shell-context';
import { t } from './i18n';

interface SkillOption {
  id: StudioScenarioSkillId;
  label: string;
  summary: string;
}

function SkillGlyph({ id, compact = false }: { id: StudioScenarioSkillId; compact?: boolean }) {
  const size = compact ? 15 : 20;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.65,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (id) {
    case STUDIO_AUTO_SKILL_ID:
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="18.5" cy="6" r="1.5" />
          <circle cx="18.5" cy="12" r="1.5" />
          <circle cx="18.5" cy="18" r="1.5" />
          <path d="M6.8 12h2.4c3.4 0 3.3-6 6.1-6h1.7M6.8 12h10.2M6.8 12h2.4c3.4 0 3.3 6 6.1 6h1.7" />
        </svg>
      );
    case 'talking-head-edit':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <circle cx="12" cy="9" r="2.1" />
          <path d="M8.4 16.4c.8-2.2 2-3.3 3.6-3.3s2.8 1.1 3.6 3.3M7 20.5v-2M17 20.5v-2" />
        </svg>
      );
    case 'long-to-shorts':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="7" height="16" rx="1.8" />
          <path d="M7 7.5v9M14 5.5h6M14 12h6M14 18.5h6" />
          <path d="m17.2 4-1.4 1.5 1.4 1.5M17.2 10.5 15.8 12l1.4 1.5M17.2 17l-1.4 1.5 1.4 1.5" />
        </svg>
      );
    case 'montage-edit':
      return (
        <svg {...common}>
          <rect x="3.5" y="6" width="9" height="11" rx="1.8" />
          <path d="m8.8 9.3 2.7 2.2-2.7 2.2zM12.5 8h4.8a2 2 0 0 1 2 2v8.2" />
          <path d="M6 3.8h10a4 4 0 0 1 4 4v8.4" />
        </svg>
      );
    case 'batch-remix':
      return (
        <svg {...common}>
          <rect x="3.5" y="9" width="5" height="6" rx="1.4" />
          <rect x="16" y="3.5" width="4.5" height="4.5" rx="1.2" />
          <rect x="16" y="9.75" width="4.5" height="4.5" rx="1.2" />
          <rect x="16" y="16" width="4.5" height="4.5" rx="1.2" />
          <path d="M8.5 12h2.3c2.2 0 1.8-6.25 5.2-6.25M8.5 12H16M8.5 12h2.3c2.2 0 1.8 6.25 5.2 6.25" />
        </svg>
      );
    case 'commerce-video':
      return (
        <svg {...common}>
          <path d="M5 8.5h14l-1 11H6zM8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" />
          <path d="m10.5 12 4 2-4 2z" />
        </svg>
      );
    case 'product-demo':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="14" rx="2.2" />
          <path d="M7 21h10M12 18v3M7 8h6M7 11h4" />
          <path d="m15.2 10.4 3.6 2-2 .6-.8 2z" />
        </svg>
      );
    case 'short-video-ad-remix':
      return (
        <svg {...common}>
          <rect x="3.5" y="4" width="6" height="7" rx="1.4" />
          <rect x="14.5" y="13" width="6" height="7" rx="1.4" />
          <path d="M9.5 7.5h3.2a2.5 2.5 0 0 1 2.5 2.5v3M12.8 10l2.4 3 2.4-3" />
          <path d="m5.8 6.2 1.8 1.3-1.8 1.3zM16.8 15.2l1.8 1.3-1.8 1.3z" />
        </svg>
      );
    case 'video-cover-design':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="m5.5 17 4-3.5 2.7 2 2.4-2.3 3.9 3.8M16 7h2M17 6v2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />
        </svg>
      );
  }
}

function SkillMark({ option, compact = false }: { option: SkillOption; compact?: boolean }) {
  return <SkillGlyph id={option.id} compact={compact} />;
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
      },
      ...skills.map((skill) => ({
        id: skill.id,
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
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center ${selectedItem ? 'text-accent' : 'text-ink-3'}`}>
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
