'use client';

import { useMemo, useRef, useState, type RefObject } from 'react';
import { CalendarDays, Check, CircleUserRound, Info, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { TriggerPopover, type TriggerPopoverHandle } from '@pireel/ui/trigger-popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { toast } from '@pireel/ui/toast';
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import type { StudioScenarioSkillOption, StudioSkillMarketMetadata } from './shell-context';
import { ScenarioSkillIcon } from './scenario-skill-icon';
import { t } from './i18n';

interface SkillOption {
  id: string;
  label: string;
  summary: string;
  icon?: string;
  custom?: boolean;
  market?: StudioSkillMarketMetadata;
  action?: 'market';
}

const OPEN_SKILL_MARKET_ID = '__open_skill_market__';

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
  if (option.action === 'market') return <ScenarioSkillIcon icon="market" size={compact ? 14 : 18} />;
  if (option.icon || option.market) {
    return <ScenarioSkillIcon icon={option.icon ?? 'skill-director'} size={compact ? 16 : 22} />;
  }
  return <SkillGlyph id={option.id as StudioScenarioSkillId} compact={compact} />;
}

function detailSourceLabel(source: StudioSkillMarketMetadata['source']): string {
  if (source === 'official') return t('chatGen.skill.detail.source.official');
  if (source === 'market') return t('chatGen.skill.detail.source.market');
  return t('chatGen.skill.detail.source.owned');
}

function visibilityLabel(visibility: StudioSkillMarketMetadata['visibility']): string {
  return t(`chatGen.skill.detail.visibility.${visibility}`);
}

function formatDetailDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

function SkillMarketDetailDialog({
  option,
  onClose,
}: {
  option: SkillOption | null;
  onClose: () => void;
}) {
  const market = option?.market;
  return (
    <Dialog open={!!option && !!market} onOpenChange={(open) => { if (!open) onClose(); }}>
      {option && market && (
        <DialogContent className="bg-panel border-line w-[min(520px,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-line border-b px-5 pb-4 pt-5 pr-12">
            <div className="flex items-start gap-3.5">
              <span className="border-line bg-bg text-ink grid size-11 shrink-0 place-items-center rounded-xl border shadow-sm">
                <SkillMark option={option} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-ink text-[16px] leading-tight">{option.label}</DialogTitle>
                  <span className="border-line bg-panel-2 text-ink-3 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                    {detailSourceLabel(market.source)}
                  </span>
                </div>
                <DialogDescription className="text-ink-3 mt-1.5 text-[12.5px] leading-relaxed">
                  {option.summary}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-5 py-4">
            <dl className="border-line grid grid-cols-2 overflow-hidden rounded-lg border">
              <div className="border-line border-b border-r px-3.5 py-3">
                <dt className="text-ink-4 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                  <CircleUserRound size={12} /> {t('chatGen.skill.detail.publisher')}
                </dt>
                <dd className="text-ink mt-1 truncate text-[12.5px] font-medium">
                  {market.publisherName || (market.source === 'owned' ? t('chatGen.skill.detail.you') : '—')}
                </dd>
              </div>
              <div className="border-line border-b px-3.5 py-3">
                <dt className="text-ink-4 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                  <ShieldCheck size={12} /> {t('chatGen.skill.detail.version')}
                </dt>
                <dd className="text-ink mt-1 text-[12.5px] font-medium">v{market.version}</dd>
              </div>
              <div className="border-line border-r px-3.5 py-3">
                <dt className="text-ink-4 text-[10px] font-medium uppercase tracking-[0.08em]">
                  {t('chatGen.skill.detail.visibility')}
                </dt>
                <dd className="text-ink mt-1 text-[12.5px] font-medium">{visibilityLabel(market.visibility)}</dd>
              </div>
              <div className="px-3.5 py-3">
                <dt className="text-ink-4 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                  <CalendarDays size={12} />
                  {market.publishedAt ? t('chatGen.skill.detail.publishedAt') : t('chatGen.skill.detail.updatedAt')}
                </dt>
                <dd className="text-ink mt-1 text-[12.5px] font-medium">
                  {market.publishedAt
                    ? formatDetailDate(market.publishedAt)
                    : market.updatedAt
                      ? formatDetailDate(market.updatedAt)
                      : '—'}
                </dd>
              </div>
            </dl>

            <section className="mt-5">
              <h3 className="text-ink-4 text-[10px] font-medium uppercase tracking-[0.08em]">
                {t('chatGen.skill.detail.description')}
              </h3>
              <p className="text-ink-2 mt-2 text-[13px] leading-6">{market.description}</p>
            </section>

            <p className="text-ink-4 mt-3 truncate font-mono text-[10px]">{market.listingId}</p>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function ChatSkillPicker({
  editorRef,
  skillId,
  skills,
  disabled,
  onChange,
  onOpenSkillMarket,
  onDeleteCustom,
  onTriggerPick,
}: {
  editorRef: RefObject<HTMLElement | null>;
  skillId: StudioScenarioSkillId;
  skills: readonly StudioScenarioSkillOption[];
  disabled?: boolean;
  onChange: (id: StudioScenarioSkillId) => void;
  onOpenSkillMarket?: () => void;
  onDeleteCustom?: (id: string) => Promise<void>;
  /** Remove the `/query` token when the picker was opened from the composer. */
  onTriggerPick?: () => void;
}) {
  const popoverRef = useRef<TriggerPopoverHandle>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SkillOption | null>(null);
  const selectableOptions = useMemo<SkillOption[]>(
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
        icon: skill.icon,
        custom: skill.custom,
        market: skill.market,
      })),
    ],
    [skills],
  );
  const options = useMemo<SkillOption[]>(() => [
    ...selectableOptions,
    ...(onOpenSkillMarket ? [{
      id: OPEN_SKILL_MARKET_ID,
      label: t('chatGen.skill.market.title'),
      summary: t('chatGen.skill.market.summary'),
      action: 'market' as const,
    }] : []),
  ], [selectableOptions, onOpenSkillMarket]);
  const selected = selectableOptions.find((item) => item.id === skillId) ?? selectableOptions[0]!;

  // No host catalog means there is nothing useful to choose: keep the empty Skill state visually quiet.
  if (selectableOptions.length === 1 && !onOpenSkillMarket) return null;

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
        title={t('chatGen.pickSkillN', { n: selectableOptions.length })}
        initialActiveKey={skillId}
        className="w-[330px]"
        onPick={(item, context) => {
          if (context.source === 'trigger') onTriggerPick?.();
          if (item.action === 'market') {
            onOpenSkillMarket?.();
            return;
          }
          onChange(item.id as StudioScenarioSkillId);
        }}
        renderItem={(item, { active, pick, setActive }) => {
          if (item.action === 'market') {
            return (
              <button
                type="button"
                data-active={active || undefined}
                onMouseEnter={setActive}
                onMouseDown={(event) => event.preventDefault()}
                onClick={pick}
                className={`border-line mt-1 flex w-full items-start gap-2.5 border-t px-2.5 pb-2 pt-3 text-left disabled:opacity-50 ${active ? 'bg-panel-2' : ''}`}
              >
                <span className="text-ink-3 grid h-8 w-8 shrink-0 place-items-center">
                  <SkillMark option={item} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink truncate text-[12.5px] font-medium">{item.label}</span>
                  <span className="text-ink-4 mt-0.5 block text-[11px] leading-snug">{item.summary}</span>
                </span>
              </button>
            );
          }
          const selectedItem = item.id === skillId;
          return (
            <div
              data-active={active || undefined}
              onMouseEnter={setActive}
              className={`group flex w-full items-center rounded-md pr-1.5 transition-colors ${active ? 'bg-panel-2' : ''}`}
            >
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={pick}
                className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left"
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
              <span className={`flex shrink-0 items-center gap-0.5 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                {item.market && (
                  <button
                    type="button"
                    aria-label={t('chatGen.skill.detail.open', { title: item.label })}
                    title={t('chatGen.skill.detail.openShort')}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      popoverRef.current?.close();
                      setDetail(item);
                    }}
                    className="text-ink-4 hover:bg-line hover:text-ink grid size-7 place-items-center rounded-md transition-colors"
                  >
                    <Info size={13.5} />
                  </button>
                )}
                {item.custom && onDeleteCustom && (
                  <button
                    type="button"
                    aria-label={t('chatGen.skill.delete')}
                    title={t('chatGen.skill.delete')}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (deletingId || !window.confirm(t('chatGen.skill.deleteConfirm', { title: item.label }))) return;
                      setDeletingId(item.id);
                      void onDeleteCustom(item.id)
                        .then(() => {
                          if (selectedItem) onChange(STUDIO_AUTO_SKILL_ID);
                          toast.success(t('chatGen.skill.deleted'));
                        })
                        .catch(() => toast.error(t('chatGen.skill.deleteFailed')))
                        .finally(() => setDeletingId(null));
                    }}
                    className="text-ink-4 hover:bg-line hover:text-ink grid size-7 place-items-center rounded-md transition-colors"
                  >
                    {deletingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </span>
            </div>
          );
        }}
      />
      <SkillMarketDetailDialog option={detail} onClose={() => setDetail(null)} />
    </>
  );
}
