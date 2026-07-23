'use client';

/**
 * The frame panel on the right rail = studio's theme template library (Hyperframes official name: frame.md).
 * One frame = one large theme content pack (knowledge voiceover / food blogger / …, open-ended themes),
 * a "content-aware template" — once attached to the chat, the agent fits your voiceover content into its playbook.
 * Unrelated to the /create line's skill system.
 * - List = one big **cover** card per row (theme name as the hero, hints at style without listing details,
 *   positioned like a PPT theme cover);
 * - Open = theme detail: summary + multi-type **real preview** cards this theme produces (showcase word →
 *   real block, rendered by BlockPreviewFrame via the same Hyperframes stack, following the project theme color; see showcase-blocks);
 * - "Use" = attach the frame to the right chat (not copy the prompt text!); the request carries frameId and
 *   the server injects the playbook. The chat input's theme button opens the same catalog.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocale } from 'use-intl';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { SkillIcon } from '@pireel/ui/skill-icon';
import { t } from './i18n';
import type { Composition } from '@pireel/studio-engine/composition';
import type { SupportedLocale as Locale } from '@pireel/studio-frames/locales';
import { framePack, kindLabel } from '@pireel/studio-frames/locales';
import { InlineBlockPreview, type PreviewPerson } from './block-preview-card';
import { coverBlock, showcaseBlock } from '@pireel/studio-frames/showcase-blocks';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';

const CARD_W = 300; // 16:9 single-column big card (panel content width ~302)

/** Preview placeholder person: only drawn for themes that declare personFx (the person is part of their
 *  design system; the dialect is written to "leave room for the person"). Other themes don't draw it —
 *  dialect roots are all fully opaque backgrounds, so a person behind is invisible while a person in front
 *  smears over the existing design. The silhouette carries this theme's person stroke (sticker white edge),
 *  which is only visible when placed in front. */
const personOf = (f: FrameCatalogItem): PreviewPerson | null =>
  f.personFx
    ? {
        front: true,
        strokeColor: f.personFx['stroke-color'] ?? null,
      }
    : null;

export function FramePanel({ comp, onUse }: { comp: Composition; onUse: (frame: FrameCatalogItem) => void }) {
  const locale = useLocale() as Locale; // frame content has its own locale adaptation pack (title/summary/preview copy)
  const frames = useFrameCatalog();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? frames.find((f) => f.id === openId) : null;
  // Restore scroll position when returning to the list: save scrollTop before opening, write it back when
  // the list container remounts (useCallback keeps a stable ref, runs only on mount)
  const listRef = useRef<HTMLDivElement | null>(null);
  const savedListScroll = useRef(0);
  const attachList = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el;
    if (el) el.scrollTop = savedListScroll.current;
  }, []);
  const openFrame = useCallback((id: string) => {
    savedListScroll.current = listRef.current?.scrollTop ?? 0;
    setOpenId(id);
  }, []);

  if (open) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="border-line flex items-center gap-2 border-b px-3 py-2">
          <button
            type="button"
            onClick={() => setOpenId(null)}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink -ml-1 inline-flex h-6 w-6 items-center justify-center rounded"
            title={t('panels.backList')}
          >
            <ArrowLeft size={13} />
          </button>
          <SkillIcon iconKey={open.iconKey} emoji={open.icon} size={22} rounded="rounded-md" />
          <span className="text-ink truncate text-[12px] font-medium">{framePack(locale, open.id)?.title ?? open.title}</span>
        </div>
        {/* key switches by frame: changing theme force-remounts the scroll container, resetting scroll to zero */}
        <div key={open.id} className="min-h-0 flex-1 overflow-auto p-2.5">
          <div className="text-ink-2 text-[11.5px] leading-relaxed">{open.summary}</div>
          {open.showcase.length > 0 ? (
            <>
              <div className="text-ink mb-1.5 mt-3 text-[11px] font-medium">{t('panels.themeProduces')}</div>
              <div className="flex flex-col gap-2">
                {open.showcase.map((kind) => (
                  <ShowcaseCard key={kind} comp={comp} frame={open} kind={kind} locale={locale} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-ink-4 mt-3 text-[10.5px]">{t('panels.noPreviewsThemeUse')}</div>
          )}
        </div>
        <div className="border-line border-t p-2.5">
          <button
            type="button"
            onClick={() => onUse(open)}
            className="bg-accent w-full rounded-md py-2 text-[12px] font-medium text-white transition hover:brightness-110"
          >
            {t('captions.use')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Single-level title: "Theme" lives in the material bar tabs header; only the description row stays here (same convention as the captions panel) */}
      <div className="border-line border-b px-3 py-2">
        <div className="text-ink-4 text-[10.5px]">{t('panels.openOneSeeWhat')}</div>
      </div>
      <div ref={attachList} className="min-h-0 flex-1 overflow-auto p-2.5">
        {frames.length === 0 ? (
          <div className="text-ink-4 pt-10 text-center text-[11px]">{t('panels.loadingCatalog')}</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {frames.map((f) => (
              <CoverCard key={f.id} comp={comp} frame={f} locale={locale} onOpen={() => openFrame(f.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** List cover card: a style cover with the theme name as hero (real render, hints at style without listing
 *  details); frames without a cover (user uploads, etc.) fall back to an icon-row style. */
function CoverCard({ comp, frame, locale, onOpen }: { comp: Composition; frame: FrameCatalogItem; locale: Locale; onOpen: () => void }) {
  const block = useMemo(() => coverBlock(frame.id, locale), [frame.id, locale]);
  const previewComp = useMemo<Composition>(
    () => ({ ...comp, width: 1920, height: 1080, ...(frame.palette ? { palette: frame.palette } : {}) }),
    [comp, frame.palette],
  );
  if (!block) {
    return (
      <button
        type="button"
        title={frame.summary}
        onClick={onOpen}
        className="border-line hover:border-accent group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition"
      >
        <SkillIcon iconKey={frame.iconKey} emoji={frame.icon} size={34} rounded="rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[11.5px] font-medium">{framePack(locale, frame.id)?.title ?? frame.title}</span>
          <span className="text-ink-4 block truncate text-[10px]">{frame.summary}</span>
        </span>
        <ChevronRight size={13} className="text-ink-4 group-hover:text-accent shrink-0" />
      </button>
    );
  }
  return (
    <button
      type="button"
      title={framePack(locale, frame.id)?.title ?? frame.title}
      onClick={onOpen}
      className="border-line hover:border-accent group w-full overflow-hidden rounded-lg border text-left transition"
    >
      <InlineBlockPreview comp={previewComp} block={block} width={CARD_W} animate="hover" person={personOf(frame)} ground="stage" />
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <span className="text-ink-4 min-w-0 flex-1 truncate text-[10px]">{frame.summary}</span>
        <PaletteDots palette={frame.palette} />
        <ChevronRight size={12} className="text-ink-4 group-hover:text-accent shrink-0" />
      </div>
    </button>
  );
}

/** Real preview card for a showcase word: builds a real block, rendered by BlockPreviewFrame (same
 *  preview/export stack, frozen on a stable frame). When the frame has a palette (design tokens), the
 *  preview comp adopts it — the card shows the theme's real color tone; unknown words fall back to a text card. */
function ShowcaseCard({ comp, frame, kind, locale }: { comp: Composition; frame: FrameCatalogItem; kind: string; locale: Locale }) {
  const block = useMemo(() => showcaseBlock(frame.id, kind, locale), [frame.id, kind, locale]);
  // Preview is always a 16:9 canvas + the frame's own design tokens (palette swaps font/radius/shadow too)
  const previewComp = useMemo<Composition>(
    () => ({ ...comp, width: 1920, height: 1080, ...(frame.palette ? { palette: frame.palette } : {}) }),
    [comp, frame.palette],
  );
  if (!block) {
    return (
      <div className="border-line flex h-[54px] items-center justify-center rounded-lg border">
        <span className="bg-panel-2 text-ink-2 rounded px-2 py-1 text-[10px]">{kindLabel(locale, kind)}</span>
      </div>
    );
  }
  return (
    <div className="border-line overflow-hidden rounded-lg border">
      {/* Output card person = small corner figure: only visible in front (dialect background is opaque), shrunk into the corner to reduce occlusion */}
      <InlineBlockPreview
        comp={previewComp}
        block={block}
        width={CARD_W}
        ground="checker"
        animate
        person={(() => {
          const p = personOf(frame);
          return p ? { ...p, size: 'corner' as const } : null;
        })()}
      />
      <div className="text-ink-3 px-1.5 py-1 text-[10px]">{kindLabel(locale, kind)}</div>
    </div>
  );
}

/** Small color strip of the theme's design tokens (accent / panel / paper, three dots), so the theme is recognizable at a glance in a list row. */
function PaletteDots({ palette }: { palette?: Record<string, string> | null }) {
  if (!palette) return null;
  const dots = ['accent', 'panel', 'paper'].map((k) => palette[k]).filter(Boolean) as string[];
  if (!dots.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {dots.map((c, i) => (
        <span key={i} className="border-line h-2.5 w-2.5 rounded-full border" style={{ background: c }} />
      ))}
    </span>
  );
}
