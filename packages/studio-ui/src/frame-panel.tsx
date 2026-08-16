"use client";

/**
 * Frame is the internal art-direction playbook behind the user-facing "visual direction" choice.
 * The unified dialog layers one direction with independent palette, caption and layout controls;
 * Skill and Director remain responsible for editorial purpose, evidence and scene strategy.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useLocale } from "use-intl";
import { SlidersHorizontal } from "lucide-react";
import { SkillIcon } from "@pireel/ui/skill-icon";
import { imageThumb } from "@pireel/ui/image-url";
import { t } from "./i18n";
import type { Composition } from "@pireel/studio-engine/composition";
import { CUSTOM_FRAME_ID } from "@pireel/studio-engine/visual-style";
import type { SupportedLocale as Locale } from "@pireel/studio-frames/locales";
import { framePack } from "@pireel/studio-frames/locales";
import { InlineBlockPreview, type PreviewPerson } from "./block-preview-card";
import { coverBlock } from "@pireel/studio-frames/showcase-blocks";
import { type FrameCatalogItem, useFrameCatalog } from "./use-frame-catalog";
import { CustomFrameDialog } from "./custom-frame-dialog";
import {
  customFrameCatalogItem,
  useCustomFrameStyle,
} from "./custom-frame-style";

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
        strokeColor: f.personFx["stroke-color"] ?? null,
      }
    : null;

export function FramePanel({
  comp,
  onUse,
  onClear,
}: {
  comp: Composition;
  onUse: (frame: FrameCatalogItem) => void;
  onClear: () => void;
}) {
  const locale = useLocale() as Locale; // frame content has its own locale adaptation pack (title/summary/preview copy)
  const frames = useFrameCatalog();
  const [customStyle, saveCustomStyle] = useCustomFrameStyle();
  const customFrame = useMemo(
    () =>
      customFrameCatalogItem(
        customStyle,
        t("customFrame.title"),
        t("customFrame.summary"),
      ),
    [customStyle],
  );
  const [customOpen, setCustomOpen] = useState<string | null>(null);
  // Restore scroll position when returning to the list: save scrollTop before opening, write it back when
  // the list container remounts (useCallback keeps a stable ref, runs only on mount)
  const listRef = useRef<HTMLDivElement | null>(null);
  const savedListScroll = useRef(0);
  const attachList = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el;
    if (el) el.scrollTop = savedListScroll.current;
  }, []);
  const openFrame = useCallback((frame: FrameCatalogItem) => {
    savedListScroll.current = listRef.current?.scrollTop ?? 0;
    setCustomOpen(frame.id);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div ref={attachList} className="min-h-0 flex-1 overflow-auto p-2.5">
        {frames.length === 0 ? (
          <div className="text-ink-4 pt-10 text-center text-[11px]">
            {t("panels.loadingCatalog")}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <CustomFrameCard
              frame={customFrame}
              onOpen={() => setCustomOpen(CUSTOM_FRAME_ID)}
            />
            {frames.map((f) => (
              <CoverCard
                key={f.id}
                comp={comp}
                frame={f}
                locale={locale}
                onOpen={() => openFrame(f)}
              />
            ))}
          </div>
        )}
      </div>
      <CustomFrameDialog
        style={customOpen ? (comp.customVisualStyle ?? customStyle) : null}
        frames={frames}
        frameId={customOpen}
        comp={comp}
        onClose={() => setCustomOpen(null)}
        onUse={(style, directionId) => {
          saveCustomStyle(style);
          const direction = frames.find((frame) => frame.id === directionId);
          onUse(
            customFrameCatalogItem(
              style,
              t("customFrame.title"),
              t("customFrame.summary"),
              direction,
            ),
          );
          setCustomOpen(null);
        }}
        onDisable={() => {
          onClear();
          setCustomOpen(null);
        }}
      />
    </div>
  );
}

function CustomFrameCard({
  frame,
  onOpen,
}: {
  frame: FrameCatalogItem;
  onOpen: () => void;
}) {
  const palette = frame.palette ?? {};
  return (
    <button
      type="button"
      onClick={onOpen}
      className="border-line hover:border-accent group relative w-full overflow-hidden rounded-lg border text-left transition"
    >
      <div
        className="relative aspect-video overflow-hidden"
        style={{
          background: `linear-gradient(145deg, ${palette.panel ?? "#191919"}, ${palette["panel-2"] ?? "#2a2a2a"})`,
        }}
      >
        <div className="absolute inset-3 grid grid-cols-[1fr_1.25fr] gap-2">
          <div className="flex flex-col justify-between">
            <SlidersHorizontal
              size={17}
              style={{ color: palette.accent ?? "#fff" }}
            />
            <span
              className="text-[13px] font-semibold leading-tight"
              style={{ color: palette.fg ?? "#fff" }}
            >
              {t("customFrame.mixYourOwn")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              palette.paper,
              palette.accent,
              palette["accent-2"],
              palette.muted,
            ].map((color, index) => (
              <span
                key={index}
                className="rounded-sm"
                style={{ background: color ?? "#777" }}
              />
            ))}
          </div>
        </div>
        <PreviewBadge />
      </div>
      <div className="px-2 py-1.5">
        <span className="text-ink block truncate text-[11px] font-medium">
          {frame.title}
        </span>
      </div>
    </button>
  );
}

/** List cover card: a style cover with the theme name as hero (real render, hints at style without listing
 *  details); frames without a cover (user uploads, etc.) fall back to an icon-row style. */
function CoverCard({
  comp,
  frame,
  locale,
  onOpen,
}: {
  comp: Composition;
  frame: FrameCatalogItem;
  locale: Locale;
  onOpen: () => void;
}) {
  const block = useMemo(() => coverBlock(frame.id, locale), [frame.id, locale]);
  const coverSrc = frame.coverKey ? imageThumb(frame.coverKey, "list") : null;
  const previewComp = useMemo<Composition>(
    () => ({
      ...comp,
      width: 1920,
      height: 1080,
      ...(frame.palette ? { palette: frame.palette } : {}),
    }),
    [comp, frame.palette],
  );
  if (!coverSrc && !block) {
    return (
      <button
        type="button"
        title={framePack(locale, frame.id)?.title ?? frame.title}
        onClick={onOpen}
        className="border-line hover:border-accent group relative flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition"
      >
        <SkillIcon
          iconKey={frame.iconKey}
          emoji={frame.icon}
          size={34}
          rounded="rounded-lg"
        />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[11.5px] font-medium">
            {framePack(locale, frame.id)?.title ?? frame.title}
          </span>
        </span>
        <PreviewBadge />
      </button>
    );
  }
  return (
    <button
      type="button"
      title={framePack(locale, frame.id)?.title ?? frame.title}
      onClick={onOpen}
      className="border-line hover:border-accent group relative w-full overflow-hidden rounded-lg border text-left transition"
    >
      {coverSrc ? (
        <img
          src={coverSrc}
          alt=""
          loading="lazy"
          className="block aspect-video w-full object-cover"
        />
      ) : (
        <InlineBlockPreview
          comp={previewComp}
          block={block!}
          width={CARD_W}
          animate="hover"
          person={personOf(frame)}
          ground="stage"
        />
      )}
      <PreviewBadge />
      <div className="px-2 py-1.5">
        <span className="text-ink block truncate text-[11px] font-medium">
          {framePack(locale, frame.id)?.title ?? frame.title}
        </span>
      </div>
    </button>
  );
}

function PreviewBadge() {
  return (
    <span className="pointer-events-none absolute right-2 top-2 translate-y-1 rounded bg-black/75 px-2 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur transition group-hover:translate-y-0 group-hover:opacity-100">
      {t("panels.previewFrame")}
    </span>
  );
}
