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
  const size = compact ? 16 : 22;
  const accent = 'var(--color-accent)';
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
          <path d="m4.25 18.2 10.9-10.9 2.55 2.55L6.8 20.75z" />
          <path d="m13.75 8.7 2.55 2.55" />
          <path d="m17.1 3 .55 1.45L19.1 5l-1.45.55L17.1 7l-.55-1.45L15.1 5l1.45-.55z" stroke={accent} />
          <path d="m20.15 12.5.35.9.9.35-.9.35-.35.9-.35-.9-.9-.35.9-.35z" stroke={accent} />
          <path d="m9.1 3.75.4 1.05 1.05.4-1.05.4-.4 1.05-.4-1.05-1.05-.4 1.05-.4z" />
        </svg>
      );
    case 'talking-head-edit':
      return (
        <svg {...common}>
          <path d="M4 7V4h3M17 4h3v3M4 15v3h3M17 18h3v-3" />
          <circle cx="12" cy="8.5" r="2.25" />
          <path d="M8.2 15.5c.8-2.3 2.1-3.5 3.8-3.5s3 1.2 3.8 3.5" />
          <path d="M5 21h14M8 19.5V22M12 19.5V22M16 19.5V22" />
          <path d="M12 18.8V22" stroke={accent} strokeWidth="2" />
          <circle cx="12" cy="18.5" r="1" stroke={accent} />
        </svg>
      );
    case 'long-to-shorts':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="7" height="18" rx="1.8" />
          <path d="m4.7 6.3 2.7 1.8-2.7 1.8zM4.5 13h3M4.5 16h2M9.5 12h3" />
          <path d="M12.5 12c1.5 0 1.2-6.5 3.2-6.5H18M12.5 12H18M12.5 12c1.5 0 1.2 6.5 3.2 6.5H18" />
          <rect x="18" y="3.5" width="3.5" height="4" rx="1" />
          <rect x="18" y="10" width="3.5" height="4" rx="1" />
          <rect x="18" y="16.5" width="3.5" height="4" rx="1" />
          <circle cx="12.5" cy="12" r="1.15" stroke={accent} />
        </svg>
      );
    case 'montage-edit':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="5" height="5" rx="1" />
          <rect x="9.5" y="3" width="5" height="5" rx="1" />
          <rect x="16.5" y="3" width="5" height="5" rx="1" />
          <path d="m3.5 7 1.4-1.5L6.5 7M11 6.8c.2-1.3.6-2 1-2s.8.7 1 2M18 6.5h2M18 5h1.2" />
          <path d="M5 8v3M12 8v3M19 8v3" strokeDasharray="1.2 1.8" />
          <rect x="2.5" y="12" width="19" height="7.5" rx="1.5" />
          <path d="m4.8 14.2 2.4 1.5-2.4 1.5zM9.5 15.8h8M18.5 14v3.5" />
          <path d="M12 11v9.5" stroke={accent} strokeWidth="2" />
          <circle cx="12" cy="11.5" r="1" stroke={accent} />
        </svg>
      );
    case 'batch-remix':
      return (
        <svg {...common}>
          <rect x="2.5" y="8.5" width="6" height="7" rx="1.5" />
          <path d="m4.8 10.6 2.2 1.4-2.2 1.4zM8.5 12h3" />
          <path d="M11.5 12c2 0 1.2-6.5 4-6.5H17M11.5 12H17M11.5 12c2 0 1.2 6.5 4 6.5H17" />
          <rect x="17" y="3.5" width="5" height="4" rx="1" />
          <rect x="17.5" y="9.5" width="4.5" height="5" rx="1" />
          <rect x="18" y="16" width="3.5" height="5" rx="1" />
          <circle cx="11.5" cy="12" r="1.2" stroke={accent} />
        </svg>
      );
    case 'commerce-video':
      return (
        <svg {...common}>
          <path d="M4.5 6h5v14h-5zM5.5 3.5h3V6M6 10h2v4H6z" />
          <path d="M10.5 12h4M13 10l2 2-2 2" />
          <path d="M15.5 9.5h6l-1 5h-4zM16.5 17.5h.1M20 17.5h.1" />
          <path d="M17 7.5 16.2 6M19 7V5M21 7.5 21.8 6" stroke={accent} strokeWidth="2" />
        </svg>
      );
    case 'product-demo':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="19" height="18" rx="2" />
          <path d="M2.5 7h19M5 5h.1M7 5h.1M9 5h.1M11 9v10" />
          <path d="M5 11h3.5v6H5zM6 9.5h1.5V11M13.5 10h5M13.5 13h4M13.5 16h2.5" />
          <path d="m18.2 15.2 2.8 1.6-1.7.5-.7 1.6z" stroke={accent} strokeWidth="1.9" />
        </svg>
      );
    case 'short-video-ad-remix':
      return (
        <svg {...common}>
          <rect x="2.5" y="8" width="5" height="7" rx="1.2" />
          <path d="M4 6.5h2V8M4 11h2v2H4zM7.5 11.5h2" />
          <circle cx="12" cy="11.5" r="2.5" stroke={accent} strokeWidth="1.9" />
          <path d="m10.6 10.3 2.8 2.4M13.4 10.3l-2.8 2.4" />
          <path d="M14.5 11.5c1.5 0 .9-6 3.1-6H19M14.5 11.5H19M14.5 11.5c1.5 0 .9 6 3.1 6H19" strokeDasharray="1.3 1.7" />
          <path d="m19.5 4 1 1.5L22 6l-1.5.5-1 1.5-1-1.5L17 6l1.5-.5zM18 11.5c1.2-1.2 2.4-1.2 3.5 0M18 17.5c1.1-1.5 2.3-1.5 3.5 0" />
        </svg>
      );
    case 'video-cover-design':
      return (
        <svg {...common}>
          <rect x="4" y="2.5" width="16" height="19" rx="1.8" />
          <path d="M6.5 7V5h2M15.5 5h2v2M6.5 17v2h2M15.5 19h2v-2" />
          <circle cx="12" cy="8" r="2.2" stroke={accent} strokeWidth="1.9" />
          <path d="m7 14 3-3 2.3 2.2 2.1-2 2.6 2.8M8 16.5h8M9.5 18.5h5" />
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
  onTriggerPick,
}: {
  editorRef: RefObject<HTMLElement | null>;
  skillId: StudioScenarioSkillId;
  skills: readonly StudioScenarioSkillOption[];
  disabled?: boolean;
  onChange: (id: StudioScenarioSkillId) => void;
  /** Remove the `/query` token when the picker was opened from the composer. */
  onTriggerPick?: () => void;
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
            : 'bg-accent/12 text-ink hover:bg-accent/20'
        }`}
      >
        <SkillMark option={selected} compact />
        <span className="truncate">{selected.label}</span>
      </button>

      <TriggerPopover<SkillOption>
        ref={popoverRef}
        trigger="/"
        editorRef={editorRef}
        enabled={!disabled}
        items={options}
        itemSearchText={(item) => `${item.label} ${item.summary}`}
        itemKey={(item) => item.id}
        title={t('chatGen.pickSkillN', { n: options.length })}
        initialActiveKey={skillId}
        className="w-[330px]"
        onPick={(item, context) => {
          if (context.source === 'trigger') onTriggerPick?.();
          onChange(item.id);
        }}
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
              <span className={`grid h-8 w-8 shrink-0 place-items-center ${selectedItem ? 'text-ink' : 'text-ink-3'}`}>
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
