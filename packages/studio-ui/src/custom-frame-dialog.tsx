"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { imageThumb } from "@pireel/ui/image-url";
import type { Block, Composition } from "@pireel/studio-engine/composition";
import {
  CAPTION_PRESETS,
  getCaptionPreset,
} from "@pireel/studio-engine/caption-presets";
import {
  CUSTOM_FRAME_ID,
  CUSTOM_STYLE_PALETTES,
  customVisualStylePalette,
  type CustomLayoutId,
  type CustomPaletteId,
  type CustomVisualStyle,
  type LeftRightPresenterId,
  type PresenterCornerId,
  type TopBottomPresenterId,
} from "@pireel/studio-engine/visual-style";
import { InlineBlockPreview } from "./block-preview-card";
import { CaptionPresetCard, CaptionPresetSample } from "./captions-panel";
import { t } from "./i18n";
import {
  InlineLayoutPositionPicker,
  LayoutStrategyOption,
  LayoutStrategyPreview,
  type LayoutPositionId,
} from "./layout-strategy-picker";
import type { FrameCatalogItem } from "./use-frame-catalog";
import {
  type MotionGraphicKind,
  type MotionGraphicPreviewCopy,
  type VisualDirectionKind,
  visualDirectionKind,
  visualDirectionMotionBlock,
} from "./visual-direction-preview";

const PALETTES: CustomPaletteId[] = [
  "monochrome",
  "cobalt",
  "ember",
  "forest",
  "sand",
  "violet",
];
const FIXED_LAYOUTS: { id: Exclude<CustomLayoutId, "smart">; label: string }[] =
  [
    { id: "split-top-bottom", label: "customFrame.layout.splitTopBottom" },
    { id: "split-left-right", label: "customFrame.layout.splitLeftRight" },
    { id: "presenter-corner", label: "customFrame.layout.presenterCorner" },
  ];
const PRESENTER_PREVIEW = "/studio/custom-frame-presenter-v1.jpg";
export const NO_VISUAL_DIRECTION_ID = "no-visual-style";
interface MotionGraphicSample {
  id: string;
  kind: MotionGraphicKind;
  kit:
    | "callout"
    | "metric"
    | "kpi"
    | "comparison"
    | "chart"
    | "steps"
    | "lowerThird"
    | "title";
}

const MOTION_GRAPHIC_SAMPLES: readonly MotionGraphicSample[] = [
  { id: "callout-poster", kind: "words", kit: "callout" },
  { id: "callout-quote", kind: "words", kit: "callout" },
  { id: "metric", kind: "number", kit: "metric" },
  { id: "kpi", kind: "data", kit: "kpi" },
  { id: "comparison", kind: "comparison", kit: "comparison" },
  { id: "chart-bars", kind: "data", kit: "chart" },
  { id: "chart-line", kind: "line", kit: "chart" },
  { id: "chart-donut", kind: "donut", kit: "chart" },
  { id: "chart-funnel", kind: "funnel", kit: "chart" },
  { id: "steps-list", kind: "steps", kit: "steps" },
  { id: "steps-flow", kind: "flow", kit: "steps" },
  { id: "steps-timeline", kind: "timeline", kit: "steps" },
  { id: "steps-cycle", kind: "cycle", kit: "steps" },
  { id: "phone-source", kind: "phone", kit: "title" },
  { id: "browser-source", kind: "browser", kit: "title" },
  { id: "document-source", kind: "document", kit: "title" },
  { id: "map-route", kind: "map", kit: "title" },
  { id: "lower-third", kind: "overlay", kit: "lowerThird" },
  { id: "section-title", kind: "brand", kit: "title" },
];

const MOTION_GRAPHIC_SAMPLE_BY_ID = new Map(
  MOTION_GRAPHIC_SAMPLES.map((sample) => [sample.id, sample]),
);

/** A direction is demonstrated through scenes that suit its own visual strengths.
 * This is intentionally not one universal checklist recolored eight ways. */
const DIRECTION_SAMPLE_IDS: Record<VisualDirectionKind, readonly string[]> = {
  neutral: [
    "callout-poster",
    "metric",
    "comparison",
    "chart-line",
    "chart-donut",
    "steps-flow",
    "steps-timeline",
    "steps-cycle",
    "phone-source",
    "browser-source",
    "document-source",
    "map-route",
    "lower-third",
  ],
  editorial: [
    "callout-quote",
    "metric",
    "chart-bars",
    "chart-line",
    "comparison",
    "document-source",
    "browser-source",
    "phone-source",
    "map-route",
    "steps-timeline",
    "steps-flow",
    "lower-third",
    "section-title",
  ],
  memphis: [
    "callout-poster",
    "metric",
    "comparison",
    "chart-bars",
    "chart-donut",
    "chart-funnel",
    "steps-flow",
    "steps-cycle",
    "phone-source",
    "browser-source",
    "map-route",
    "lower-third",
    "section-title",
  ],
  tech: [
    "kpi",
    "chart-bars",
    "chart-line",
    "chart-donut",
    "chart-funnel",
    "steps-flow",
    "steps-cycle",
    "phone-source",
    "browser-source",
    "map-route",
    "document-source",
    "comparison",
    "section-title",
  ],
  collage: [
    "callout-quote",
    "comparison",
    "chart-donut",
    "chart-line",
    "document-source",
    "phone-source",
    "browser-source",
    "map-route",
    "steps-list",
    "steps-timeline",
    "steps-cycle",
    "lower-third",
    "section-title",
  ],
  brutalist: [
    "callout-poster",
    "metric",
    "comparison",
    "chart-bars",
    "chart-funnel",
    "steps-list",
    "steps-flow",
    "phone-source",
    "browser-source",
    "map-route",
    "document-source",
    "lower-third",
    "section-title",
  ],
  organic: [
    "callout-quote",
    "metric",
    "chart-donut",
    "chart-line",
    "chart-funnel",
    "steps-timeline",
    "steps-cycle",
    "phone-source",
    "browser-source",
    "map-route",
    "document-source",
    "comparison",
    "lower-third",
    "section-title",
  ],
};

function directionSamples(
  direction: VisualDirectionKind,
): MotionGraphicSample[] {
  return DIRECTION_SAMPLE_IDS[direction]
    .map((id) => MOTION_GRAPHIC_SAMPLE_BY_ID.get(id))
    .filter((sample): sample is MotionGraphicSample => sample != null);
}

function optionLabel(group: "palette", id: string): string {
  const slug = id.replace(/-([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  return t(`customFrame.${group}.${slug}`);
}

export function CustomFrameDialog({
  style,
  frames = [],
  frameId,
  onClose,
  onUse,
  onDisable,
}: {
  style: CustomVisualStyle | null;
  frames?: readonly FrameCatalogItem[];
  frameId?: string | null;
  comp?: Composition;
  onClose: () => void;
  onUse: (style: CustomVisualStyle, frameId: string) => void;
  onDisable: () => void;
}) {
  const [draft, setDraft] = useState<CustomVisualStyle | null>(style);
  const [directionId, setDirectionId] = useState(
    frameId ?? NO_VISUAL_DIRECTION_ID,
  );
  useEffect(() => setDraft(style), [style]);
  useEffect(
    () => setDirectionId(frameId ?? NO_VISUAL_DIRECTION_ID),
    [frameId, style],
  );
  useEffect(() => {
    if (!style) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [style, onClose]);

  if (!draft || typeof document === "undefined") return null;
  const baseDirection: FrameCatalogItem = {
    id: CUSTOM_FRAME_ID,
    title: t("customFrame.direction.base"),
    summary: t("customFrame.direction.baseHint"),
    icon: "✣",
    showcase: [],
    // The rail is a catalog of visual directions, not a live palette preview.
    // Keep its neutral direction signature stable while the middle column edits.
    palette: CUSTOM_STYLE_PALETTES.monochrome,
  };
  const noVisualDirection: FrameCatalogItem = {
    id: NO_VISUAL_DIRECTION_ID,
    title: t("customFrame.direction.none"),
    summary: t("customFrame.direction.noneHint"),
    icon: "○",
    showcase: [],
    palette: CUSTOM_STYLE_PALETTES.monochrome,
  };
  const directions = [noVisualDirection, baseDirection, ...frames];
  const direction =
    directions.find((item) => item.id === directionId) ?? noVisualDirection;
  const noVisual = direction.id === NO_VISUAL_DIRECTION_ID;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("customFrame.title")}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="bg-panel flex max-h-[min(900px,calc(100dvh-16px))] w-full max-w-[1480px] flex-col overflow-hidden rounded-xl shadow-2xl">
        <div className="border-line flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SlidersHorizontal size={15} className="text-ink-3" />
          <div className="text-ink min-w-0 flex-1 truncate text-[13px] font-medium">
            {t("customFrame.title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:bg-panel-2 hover:text-ink inline-flex h-8 w-8 items-center justify-center rounded-md"
            title={t("common.closePreview")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[220px_420px_minmax(0,1fr)] lg:overflow-hidden">
          <VisualDirectionRail
            directions={directions}
            selectedId={direction.id}
            onPick={setDirectionId}
          />
          <div className="min-w-0 space-y-6 bg-panel p-4 lg:overflow-y-auto lg:p-5">
            {noVisual ? (
              <NoVisualConfiguration />
            ) : (
              <>
                <OptionSection
                  title={t("customFrame.palette")}
                  hint={t("customFrame.paletteHint")}
                >
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
                    {PALETTES.map((id) => {
                      const palette = CUSTOM_STYLE_PALETTES[id];
                      const selected = draft.palette === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setDraft({ ...draft, palette: id })}
                          className={`relative rounded-lg bg-panel-2/45 p-1.5 text-left transition-colors hover:bg-panel-2 ${selected ? "ring-accent ring-2" : ""}`}
                        >
                          <span className="flex h-8 overflow-hidden rounded-md">
                            <span
                              className="flex-1"
                              style={{ background: palette.panel }}
                            />
                            <span
                              className="w-1/3"
                              style={{ background: palette.accent }}
                            />
                            <span
                              className="w-1/4"
                              style={{ background: palette.paper }}
                            />
                          </span>
                          <span className="text-ink mt-1.5 block truncate text-[10px]">
                            {optionLabel("palette", id)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </OptionSection>

                <OptionSection
                  title={t("customFrame.captions")}
                  hint={t("customFrame.captionsHint")}
                >
                  <CaptionPresetPicker
                    value={draft.captionPreset}
                    onChange={(captionPreset) =>
                      setDraft({ ...draft, captionPreset })
                    }
                  />
                </OptionSection>

                <OptionSection
                  title={t("customFrame.layout")}
                  hint={t("customFrame.layoutHint")}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.layout === "smart"}
                    onClick={() => setDraft({ ...draft, layout: "smart" })}
                    className={`mb-2 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${draft.layout === "smart" ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
                  >
                    <span className="bg-canvas block h-12 w-20 shrink-0 overflow-hidden rounded-md">
                      <LayoutStrategyPreview id="smart" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block text-[11px] font-medium">
                        {t("customFrame.layout.smart")}
                      </span>
                      <span className="text-ink-4 mt-0.5 block text-[10px]">
                        {t("customFrame.layout.smartHint")}
                      </span>
                    </span>
                    {draft.layout === "smart" && (
                      <Check
                        size={13}
                        className="text-accent shrink-0"
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                  <div className="text-ink-4 mb-1.5 text-[10px]">
                    {t("customFrame.layout.fixed")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {FIXED_LAYOUTS.map((layout) => {
                      const selected = draft.layout === layout.id;
                      return (
                        <div key={layout.id}>
                          <LayoutStrategyOption
                            id={layout.id}
                            label={t(layout.label)}
                            selected={selected}
                            onPick={() =>
                              setDraft({ ...draft, layout: layout.id })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  {draft.layout !== "smart" && (
                    <PresenterPositionPicker
                      style={draft}
                      onChange={(patch) => setDraft({ ...draft, ...patch })}
                    />
                  )}
                </OptionSection>
              </>
            )}
          </div>

          <div className="bg-canvas min-h-[440px] p-4 lg:min-h-0 lg:overflow-y-auto lg:p-5">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="text-ink text-[11.5px] font-medium">
                  {direction.title}
                </div>
                <div className="text-ink-4 mt-0.5 text-[10.5px]">
                  {t(
                    noVisual
                      ? "customFrame.direction.nonePreviewHint"
                      : "customFrame.previewSetHint",
                  )}
                </div>
              </div>
              <div className="text-ink-4 shrink-0 text-[10px]">16:9</div>
            </div>
            {noVisual ? (
              <NoVisualPreview />
            ) : (
              <PreviewSet style={draft} direction={direction} />
            )}
          </div>
        </div>

        <div className="border-line flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-ink-4 hidden max-w-[680px] text-[10.5px] leading-relaxed sm:block">
            {t(
              noVisual
                ? "customFrame.direction.noneFooterHint"
                : "customFrame.freeMixHint",
            )}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-ink-2 hover:bg-panel-2 h-9 rounded-md px-4 text-[12px]"
            >
              {t("customFrame.cancel")}
            </button>
            <button
              type="button"
              onClick={() =>
                noVisual ? onDisable() : onUse(draft, direction.id)
              }
              className="bg-ink text-bg hover:opacity-85 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-[12px] font-medium"
            >
              <Check size={13} strokeWidth={2.5} />
              {t(
                noVisual
                  ? "customFrame.direction.disable"
                  : "customFrame.useStyle",
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NoVisualConfiguration() {
  return (
    <div className="flex min-h-[360px] flex-col justify-center px-2 lg:min-h-full">
      <div className="text-ink-4 mb-5 font-mono text-[10px] tracking-[0.14em]">
        RAW / NO DIRECTION
      </div>
      <h3 className="text-ink max-w-[300px] text-[20px] font-semibold leading-tight tracking-[-0.025em]">
        {t("customFrame.direction.noneConfigurationTitle")}
      </h3>
      <p className="text-ink-3 mt-3 max-w-[330px] text-[11.5px] leading-relaxed">
        {t("customFrame.direction.noneConfigurationBody")}
      </p>
      <div className="mt-8 flex items-center gap-3">
        <span className="bg-line h-px flex-1" />
        <span className="text-ink-4 font-mono text-[9px] tracking-[0.12em]">
          FRAME / OFF
        </span>
      </div>
    </div>
  );
}

function NoVisualPreview() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black shadow-[0_18px_42px_rgb(0_0_0/0.2)]">
      <img
        src={PRESENTER_PREVIEW}
        alt={t("customFrame.direction.nonePreviewAlt")}
        className="h-full w-full object-cover object-center"
      />
    </div>
  );
}

function VisualDirectionRail({
  directions,
  selectedId,
  onPick,
}: {
  directions: readonly FrameCatalogItem[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <aside className="bg-canvas min-w-0 p-3 lg:overflow-y-auto">
      <div className="px-1 pb-2">
        <div className="text-ink text-[11.5px] font-medium">
          {t("customFrame.direction")}
        </div>
        <div className="text-ink-4 mt-0.5 text-[10px] leading-relaxed">
          {t("customFrame.directionHint")}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
        {directions.map((direction) => {
          const selected = direction.id === selectedId;
          const title = direction.title;
          const coverSrc = direction.coverKey
            ? imageThumb(direction.coverKey, "list")
            : null;
          return (
            <button
              key={direction.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPick(direction.id)}
              className={`group flex min-w-0 items-center gap-2 rounded-lg p-1.5 text-left transition-colors ${selected ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
            >
              <span
                className={`relative h-[46px] w-[74px] shrink-0 overflow-hidden rounded-md ${selected ? "ring-accent ring-2" : ""}`}
              >
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <VisualDirectionThumbnail
                    directionId={direction.id}
                    palette={visualDirectionThumbnailPalette(direction)}
                  />
                )}
              </span>
              <span className="text-ink min-w-0 flex-1 truncate text-[11px] font-medium">
                {title}
              </span>
              {selected && (
                <Check
                  size={12}
                  className="text-accent shrink-0"
                  strokeWidth={2.5}
                />
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/** Catalog thumbnails express the direction's own signature and never inherit
 * the independently edited palette from the middle column. */
export function visualDirectionThumbnailPalette(
  direction: Pick<FrameCatalogItem, "palette">,
): Record<string, string> {
  return direction.palette ?? CUSTOM_STYLE_PALETTES.monochrome;
}

function VisualDirectionThumbnail({
  directionId,
  palette,
}: {
  directionId: string;
  palette: Record<string, string>;
}) {
  if (directionId === NO_VISUAL_DIRECTION_ID)
    return (
      <span className="relative block h-full w-full overflow-hidden bg-black">
        <img
          src={PRESENTER_PREVIEW}
          alt=""
          className="h-full w-full object-cover object-center grayscale"
        />
        <span className="absolute inset-0 bg-black/30" />
        <b className="absolute bottom-1.5 left-2 font-mono text-[6px] font-medium tracking-[0.12em] text-white/80">
          RAW
        </b>
      </span>
    );
  const direction = visualDirectionKind(directionId);
  const common = { background: palette.panel, color: palette.fg };
  if (direction === "editorial")
    return (
      <span
        className="relative block h-full w-full overflow-hidden"
        style={{ background: palette.paper }}
      >
        <i
          className="absolute bottom-1.5 left-2 top-1.5 w-px"
          style={{ background: palette.line }}
        />
        <b
          className="absolute left-3 top-2 h-1 w-8"
          style={{ background: palette.panel }}
        />
        <b
          className="absolute left-3 top-4 h-3 w-11 border-y"
          style={{ borderColor: palette.line }}
        />
        <i
          className="absolute bottom-2 right-2 h-1 w-5"
          style={{ background: palette.accent }}
        />
      </span>
    );
  if (direction === "memphis")
    return (
      <span
        className="relative block h-full w-full overflow-hidden"
        style={{ background: palette.paper }}
      >
        <i
          className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full"
          style={{ background: palette.accent }}
        />
        <i
          className="absolute right-2 top-2 h-4 w-4 rotate-12"
          style={{ background: palette["accent-2"] }}
        />
        <b
          className="absolute left-5 top-3 -rotate-6 text-[10px] font-black leading-none"
          style={{ color: palette.panel }}
        >
          POP
        </b>
        <i
          className="absolute bottom-2 right-3 h-3 w-5"
          style={{
            backgroundImage: `radial-gradient(${palette.panel} 1px,transparent 1px)`,
            backgroundSize: "4px 4px",
          }}
        />
      </span>
    );
  if (direction === "tech")
    return (
      <span
        className="relative block h-full w-full overflow-hidden"
        style={{
          ...common,
          backgroundImage: `linear-gradient(${palette.grid} 1px,transparent 1px),linear-gradient(90deg,${palette.grid} 1px,transparent 1px)`,
          backgroundSize: "8px 8px",
        }}
      >
        <i
          className="absolute left-2 top-2 h-5 w-5 border-l border-t"
          style={{ borderColor: palette.accent }}
        />
        <i
          className="absolute bottom-2 right-2 h-2 w-2"
          style={{
            background: palette.accent,
            boxShadow: `0 0 6px ${palette.accent}`,
          }}
        />
        <b
          className="absolute bottom-2 left-2 font-mono text-[7px]"
          style={{ color: palette.fg }}
        >
          SYS.01
        </b>
      </span>
    );
  if (direction === "collage")
    return (
      <span
        className="relative block h-full w-full overflow-hidden"
        style={{ background: palette.paper }}
      >
        <i
          className="absolute -left-1 top-1 h-9 w-7 rotate-6"
          style={{
            background: palette.accent,
            clipPath: "polygon(4% 0,100% 6%,91% 100%,0 92%)",
          }}
        />
        <i
          className="absolute left-5 top-2 h-8 w-8 bg-black grayscale"
          style={{
            clipPath: "polygon(3% 0,100% 3%,92% 100%,0 93%)",
            backgroundImage: `radial-gradient(${palette.paper} 1px,transparent 1px)`,
            backgroundSize: "3px 3px",
          }}
        />
        <b
          className="absolute bottom-1.5 right-1.5 -rotate-3 px-1 text-[7px] font-black"
          style={{ background: palette["accent-2"], color: palette.panel }}
        >
          CUT
        </b>
      </span>
    );
  if (direction === "brutalist")
    return (
      <span
        className="relative block h-full w-full overflow-hidden border-2"
        style={{ background: palette.paper, borderColor: palette.panel }}
      >
        <b
          className="absolute left-1 top-1 text-[9px] font-black leading-[.8]"
          style={{ color: palette.panel }}
        >
          RAW
          <br />
          TYPE
        </b>
        <i
          className="absolute right-0 top-0 h-4 w-5 border-b-2 border-l-2"
          style={{ background: palette.accent, borderColor: palette.panel }}
        />
        <i
          className="absolute bottom-1 left-1 right-1 h-1"
          style={{ background: palette.panel }}
        />
      </span>
    );
  if (direction === "organic")
    return (
      <span
        className="relative block h-full w-full overflow-hidden"
        style={common}
      >
        <i
          className="absolute -left-3 -top-4 h-12 w-12 opacity-80"
          style={{
            background: palette.accent,
            borderRadius: "42% 58% 64% 36% / 45% 32% 68% 55%",
          }}
        />
        <i
          className="absolute -bottom-3 right-0 h-10 w-10 border"
          style={{
            borderColor: palette["accent-2"],
            borderRadius: "61% 39% 45% 55% / 38% 62% 38% 62%",
          }}
        />
        <b
          className="absolute bottom-2 left-3 text-[8px] font-medium"
          style={{ color: palette.fg }}
        >
          FLOW
        </b>
      </span>
    );
  return (
    <span className="flex h-full w-full" style={{ background: palette.panel }}>
      <span
        className="mt-auto h-3/5 flex-1"
        style={{ background: palette.paper }}
      />
      <span className="h-full w-1/3" style={{ background: palette.accent }} />
    </span>
  );
}

function CaptionPresetPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = getCaptionPreset(value);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center gap-3 rounded-lg bg-panel-2/45 p-2 text-left transition-colors hover:bg-panel-2 ${open ? "bg-panel-2" : ""}`}
      >
        <span className="flex h-[54px] w-[180px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#2b2b2e] px-3">
          <CaptionPresetSample p={selected} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[11px] font-medium">
            {t(selected.name)}
          </span>
          <span className="text-ink-4 mt-0.5 block text-[10px]">
            {t(
              selected.mode === "line"
                ? "captions.lineByLine"
                : "captions.wordEmphasis",
            )}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`text-ink-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="bg-panel absolute left-0 right-0 top-full z-30 mt-1 max-h-[360px] overflow-y-auto rounded-lg p-2 shadow-2xl ring-1 ring-black/20">
          {(["line", "emphasis"] as const).map((mode) => (
            <div key={mode} className="mb-2 last:mb-0">
              <div className="text-ink-4 mb-1.5 text-[10px]">
                {t(
                  mode === "line"
                    ? "captions.lineByLine"
                    : "captions.wordEmphasis",
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CAPTION_PRESETS.filter((preset) => preset.mode === mode).map(
                  (preset) => (
                    <CaptionPresetCard
                      key={preset.id}
                      preset={preset}
                      active={preset.id === value}
                      onPick={(id) => {
                        onChange(id);
                        setOpen(false);
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-ink text-[11.5px] font-medium">{title}</h3>
        {hint && (
          <p className="text-ink-4 mt-0.5 text-[10px] leading-relaxed">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

const CORNERS: { id: PresenterCornerId; label: string }[] = [
  { id: "top-left", label: "customFrame.corner.topLeft" },
  { id: "top-right", label: "customFrame.corner.topRight" },
  { id: "bottom-left", label: "customFrame.corner.bottomLeft" },
  { id: "bottom-right", label: "customFrame.corner.bottomRight" },
];

type PresenterPosition =
  | TopBottomPresenterId
  | LeftRightPresenterId
  | PresenterCornerId;

function PresenterPositionPicker({
  style,
  onChange,
}: {
  style: CustomVisualStyle;
  onChange: (
    patch: Partial<
      Pick<
        CustomVisualStyle,
        "topBottomPresenter" | "leftRightPresenter" | "presenterCorner"
      >
    >,
  ) => void;
}) {
  const options: { id: PresenterPosition; label: string }[] =
    style.layout === "split-top-bottom"
      ? [
          { id: "top", label: "customFrame.position.top" },
          { id: "bottom", label: "customFrame.position.bottom" },
        ]
      : style.layout === "split-left-right"
        ? [
            { id: "left", label: "customFrame.position.left" },
            { id: "right", label: "customFrame.position.right" },
          ]
        : CORNERS;
  const value: PresenterPosition =
    style.layout === "split-top-bottom"
      ? style.topBottomPresenter
      : style.layout === "split-left-right"
        ? style.leftRightPresenter
        : style.presenterCorner;
  const pick = (id: PresenterPosition) => {
    if (style.layout === "split-top-bottom")
      onChange({ topBottomPresenter: id as TopBottomPresenterId });
    else if (style.layout === "split-left-right")
      onChange({ leftRightPresenter: id as LeftRightPresenterId });
    else onChange({ presenterCorner: id as PresenterCornerId });
  };
  return (
    <InlineLayoutPositionPicker
      title={t("customFrame.corner.position")}
      options={options.map((option) => ({
        id: option.id as LayoutPositionId,
        label: t(option.label),
      }))}
      value={value as LayoutPositionId}
      onPick={(id) => pick(id as PresenterPosition)}
    />
  );
}

function PreviewSet({
  style,
  direction,
}: {
  style: CustomVisualStyle;
  direction: FrameCatalogItem;
}) {
  if (direction.id === "performance-native")
    return <ProductNativePreviewSet style={style} direction={direction} />;

  const palette = customVisualStylePalette(
    style,
    direction.id === CUSTOM_FRAME_ID ? null : direction.palette,
  );
  const visualDirection = visualDirectionKind(direction.id);
  const samples = directionSamples(visualDirection);
  const [selectedSceneId, setSelectedSceneId] = useState("talking-head");
  const activeSceneId =
    selectedSceneId === "talking-head" ||
    samples.some((sample) => sample.id === selectedSceneId)
      ? selectedSceneId
      : "talking-head";
  const selectedSample =
    samples.find((sample) => sample.id === activeSceneId) ?? null;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-black shadow-[0_18px_42px_rgb(0_0_0/0.2)]">
        {selectedSample ? (
          <MotionGraphicPreviewCard
            style={style}
            directionId={direction.id}
            palette={palette}
            sample={selectedSample}
            animate
          />
        ) : (
          <TalkingHeadPreview
            style={style}
            directionId={direction.id}
            palette={palette}
          />
        )}
      </div>
      <div
        role="tablist"
        aria-label={t("customFrame.previewSet")}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSceneId === "talking-head"}
          aria-label={t("customFrame.componentTalkingHead")}
          onClick={() => setSelectedSceneId("talking-head")}
          className={`relative w-[82px] shrink-0 overflow-hidden rounded-md bg-black text-left transition duration-200 hover:opacity-100 active:scale-[.98] ${activeSceneId === "talking-head" ? "opacity-100" : "opacity-55 hover:opacity-80"}`}
        >
          <TalkingHeadPreview
            style={style}
            directionId={direction.id}
            palette={palette}
            thumbnail
          />
          {activeSceneId === "talking-head" ? (
            <span
              aria-hidden
              className="ring-accent pointer-events-none absolute inset-0 z-10 rounded-md ring-2 ring-inset"
            />
          ) : null}
        </button>
        {samples.map((sample, previewIndex) => {
          const selected = activeSceneId === sample.id;
          return (
            <button
              key={`preview-slot-${previewIndex}`}
              type="button"
              role="tab"
              data-preview-slot={previewIndex}
              aria-selected={selected}
              aria-label={motionGraphicSampleLabel(sample)}
              onClick={() => setSelectedSceneId(sample.id)}
              className={`relative w-[82px] shrink-0 overflow-hidden rounded-md bg-black text-left transition duration-200 hover:opacity-100 active:scale-[.98] ${selected ? "opacity-100" : "opacity-55 hover:opacity-80"}`}
            >
              <MotionGraphicThumbnail
                directionId={direction.id}
                palette={palette}
                sample={sample}
              />
              {selected ? (
                <span
                  aria-hidden
                  className="ring-accent pointer-events-none absolute inset-0 z-10 rounded-md ring-2 ring-inset"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-ink-4 text-[10px] leading-relaxed">
        {t("customFrame.motionGraphicsHint")}
      </p>
    </div>
  );
}

const PRODUCT_NATIVE_PREVIEWS = [
  {
    id: "product",
    label: "PRODUCT",
    kicker: "PRODUCT / 01",
    headlineKey: "customFrame.productNative.productHeadline",
    noteKey: "customFrame.productNative.productNote",
    zoom: 1,
    origin: "center",
  },
  {
    id: "action",
    label: "ACTION",
    kicker: "REAL USE / 02",
    headlineKey: "customFrame.productNative.actionHeadline",
    noteKey: "customFrame.productNative.actionNote",
    zoom: 1.72,
    origin: "82% 18%",
  },
  {
    id: "texture",
    label: "TEXTURE",
    kicker: "DETAIL / 03",
    headlineKey: "customFrame.productNative.textureHeadline",
    noteKey: "customFrame.productNative.textureNote",
    zoom: 1.82,
    origin: "82% 82%",
  },
  {
    id: "type",
    label: "LIGHT TYPE",
    kicker: "BENEFIT / 04",
    headlineKey: "customFrame.productNative.typeHeadline",
    noteKey: "customFrame.productNative.typeNote",
    zoom: 1.14,
    origin: "30% 50%",
  },
  {
    id: "release",
    label: "RESULT / CTA",
    kicker: "RESULT / 05",
    headlineKey: "customFrame.productNative.releaseHeadline",
    noteKey: "customFrame.productNative.releaseNote",
    zoom: 1.18,
    origin: "30% 50%",
  },
] as const;

function ProductNativePreviewSet({
  style,
  direction,
}: {
  style: CustomVisualStyle;
  direction: FrameCatalogItem;
}) {
  const palette = customVisualStylePalette(style, direction.palette);
  const [selectedId, setSelectedId] = useState<string>(
    PRODUCT_NATIVE_PREVIEWS[0].id,
  );
  const selected =
    PRODUCT_NATIVE_PREVIEWS.find((sample) => sample.id === selectedId) ??
    PRODUCT_NATIVE_PREVIEWS[0];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-black shadow-[0_18px_42px_rgb(0_0_0/0.2)]">
        <ProductNativeScene
          coverKey={
            direction.coverKey ?? "/studio/frame-covers/performance-native.jpg"
          }
          palette={palette}
          sample={selected}
        />
      </div>
      <div
        role="tablist"
        aria-label={t("customFrame.previewSet")}
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {PRODUCT_NATIVE_PREVIEWS.map((sample) => {
          const active = selected.id === sample.id;
          return (
            <button
              key={sample.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={sample.label}
              onClick={() => setSelectedId(sample.id)}
              className={`relative w-[96px] shrink-0 overflow-hidden rounded-md bg-black text-left transition duration-200 hover:opacity-100 active:scale-[.98] ${active ? "opacity-100" : "opacity-55 hover:opacity-80"}`}
            >
              <ProductNativeScene
                coverKey={
                  direction.coverKey ??
                  "/studio/frame-covers/performance-native.jpg"
                }
                palette={palette}
                sample={sample}
                thumbnail
              />
              {active ? (
                <span
                  aria-hidden
                  className="ring-accent pointer-events-none absolute inset-0 z-10 rounded-md ring-2 ring-inset"
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-ink-4 text-[10px] leading-relaxed">
        {t("customFrame.productNative.hint")}
      </p>
    </div>
  );
}

function ProductNativeScene({
  coverKey,
  palette,
  sample,
  thumbnail = false,
}: {
  coverKey: string;
  palette: Record<string, string>;
  sample: (typeof PRODUCT_NATIVE_PREVIEWS)[number];
  thumbnail?: boolean;
}) {
  const isType = sample.id === "type";
  const isRelease = sample.id === "release";
  return (
    <div
      className="relative aspect-video overflow-hidden"
      style={{ background: palette.paper }}
    >
      <img
        src={coverKey}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500"
        style={{
          transform: `scale(${sample.zoom})`,
          transformOrigin: sample.origin,
        }}
      />
      <span
        className="absolute left-[4.5%] top-[6%] h-1 w-[7%] rounded-full"
        style={{ background: palette.accent }}
      />
      {!thumbnail ? (
        <>
          <span
            className="absolute left-[4.5%] top-[10%] font-mono text-[9px] font-semibold tracking-[0.16em]"
            style={{ color: palette.fg }}
          >
            {sample.kicker}
          </span>
          <div
            className={`absolute max-w-[43%] ${isRelease ? "bottom-[7%] right-[4.5%] text-right" : "bottom-[8%] left-[4.5%]"}`}
          >
            <strong
              className={`${isType ? "text-[clamp(24px,4.8vw,58px)]" : "text-[clamp(20px,3.4vw,44px)]"} block text-balance font-black leading-[0.94] tracking-[-0.055em]`}
              style={{ color: palette.fg }}
            >
              {t(sample.headlineKey)}
            </strong>
            <span
              className="mt-2 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.04em]"
              style={{
                background: isRelease ? palette.fg : palette.paper,
                color: isRelease ? palette.paper : palette.fg,
                boxShadow: "0 6px 18px rgb(0 0 0 / .1)",
              }}
            >
              {t(sample.noteKey)}
            </span>
          </div>
          {sample.id === "texture" ? (
            <span
              aria-hidden
              className="absolute bottom-[25%] right-[21%] h-12 w-12 rounded-full border-2"
              style={{ borderColor: palette.accent }}
            />
          ) : null}
          {isRelease ? (
            <span
              className="absolute bottom-[7%] left-[4.5%] rounded-full px-4 py-2 text-[11px] font-bold"
              style={{ background: palette.accent, color: palette.fg }}
            >
              {t("customFrame.productNative.cta")}
            </span>
          ) : null}
        </>
      ) : (
        <span
          className="absolute bottom-1.5 left-2 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[6px] font-semibold tracking-[0.12em] text-white"
        >
          {sample.label}
        </span>
      )}
    </div>
  );
}

function motionGraphicSampleLabel(sample: MotionGraphicSample): string {
  if (sample.kind === "words") return t("customFrame.sample.words");
  if (sample.kind === "number") return t("customFrame.sample.number");
  if (sample.kind === "comparison") return t("customFrame.sample.comparison");
  if (sample.kind === "data" || sample.kind === "donut")
    return t("customFrame.sample.data");
  if (sample.kind === "line" || sample.kind === "funnel")
    return t("customFrame.sample.data");
  if (
    sample.kind === "steps" ||
    sample.kind === "flow" ||
    sample.kind === "timeline" ||
    sample.kind === "cycle"
  )
    return t("customFrame.sample.process");
  if (sample.kind === "phone") return t("customFrame.sample.phone");
  if (sample.kind === "browser") return t("customFrame.sample.browser");
  if (sample.kind === "map") return t("customFrame.sample.map");
  if (sample.kind === "document") return t("customFrame.sample.document");
  if (sample.kind === "overlay") return t("customFrame.sample.overlay");
  return t("customFrame.sample.title");
}

function TalkingHeadPreview({
  style,
  directionId,
  palette,
  thumbnail = false,
}: {
  style: CustomVisualStyle;
  directionId: string;
  palette: Record<string, string>;
  thumbnail?: boolean;
}) {
  const zones = previewSafeZones(style);
  const caption = getCaptionPreset(style.captionPreset);
  const direction = visualDirectionKind(directionId);
  const treatment = talkingHeadTreatment(direction, palette, style.layout);
  return (
    <div
      className="relative aspect-video overflow-hidden bg-black"
      style={treatment.stage}
      data-visual-direction={direction}
    >
      <div
        className={`absolute overflow-hidden ${style.layout === "presenter-corner" ? "rounded-lg shadow-2xl" : ""}`}
        style={{
          ...normalizedBoxStyle(zones.media),
          ...(style.layout === "smart" ? {} : treatment.media),
        }}
      >
        <img
          src={PRESENTER_PREVIEW}
          alt=""
          className="h-full w-full object-cover object-center"
          style={treatment.image}
        />
        <span className="absolute inset-0" style={treatment.imageOverlay} />
      </div>
      <DirectionSceneDecor direction={direction} palette={palette} />
      <div
        className="absolute flex flex-col justify-center"
        style={{ ...normalizedBoxStyle(zones.content), ...treatment.copy }}
      >
        <div
          className={`${thumbnail ? "text-[5px]" : "text-[clamp(16px,3.2vw,34px)]"} font-semibold leading-[0.98] tracking-[-0.045em]`}
          style={treatment.headline}
        >
          {t("customFrame.previewHeadline")}
        </div>
        <div
          className={`${thumbnail ? "mt-0.5 h-px w-3" : "mt-2 h-0.5 w-12"}`}
          style={treatment.rule}
        />
        {!thumbnail && (
          <div
            className="mt-2 max-w-[210px] text-[9px] leading-relaxed opacity-70"
            style={treatment.body}
          >
            {t("customFrame.previewSubhead")}
          </div>
        )}
      </div>
      {!thumbnail && (
        <div
          className="absolute z-10 flex items-center justify-center whitespace-nowrap"
          style={normalizedBoxStyle(zones.captions)}
        >
          <CaptionPresetSample
            p={caption}
            segments={[
              t("customFrame.captionPre"),
              t("customFrame.captionWord"),
              t("customFrame.captionPost"),
            ]}
          />
        </div>
      )}
      <span
        className={`absolute ${thumbnail ? "right-1 top-1 h-1 w-1" : "right-3 top-3 h-2 w-2"}`}
        style={treatment.indicator}
      />
    </div>
  );
}

interface TalkingHeadTreatment {
  stage: CSSProperties;
  media: CSSProperties;
  image: CSSProperties;
  imageOverlay: CSSProperties;
  copy: CSSProperties;
  headline: CSSProperties;
  body: CSSProperties;
  rule: CSSProperties;
  indicator: CSSProperties;
}

function talkingHeadTreatment(
  direction: ReturnType<typeof visualDirectionKind>,
  palette: Record<string, string>,
  layout: CustomLayoutId,
): TalkingHeadTreatment {
  const base = {
    stage: { background: palette.panel },
    media: {},
    image: {},
    imageOverlay: {
      background:
        "linear-gradient(90deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.05) 54%,transparent 100%)",
    },
    copy: { color: palette.fg },
    headline: {},
    body: {},
    rule: { background: palette.accent },
    indicator: { background: palette.accent, borderRadius: "999px" },
  } satisfies TalkingHeadTreatment;
  if (direction === "editorial")
    return {
      ...base,
      stage: { background: palette.paper },
      media: { margin: "3.5%", border: `1px solid ${palette.line}` },
      image: { filter: "saturate(.82) contrast(1.03)" },
      imageOverlay: {
        ...(layout === "smart"
          ? { background: palette.paper, right: "auto", width: "46%" }
          : { display: "none" }),
      },
      copy: { color: palette.panel },
      headline: { fontFamily: palette["font-head"], fontWeight: 600 },
      body: { color: palette.muted },
      rule: { background: palette.accent, height: 1 },
      indicator: { background: palette.accent, borderRadius: 0 },
    };
  if (direction === "memphis")
    return {
      ...base,
      stage: { background: palette.paper },
      media: {
        border: `3px solid ${palette.panel}`,
        boxShadow: `7px 7px 0 ${palette.accent}`,
        transform: "rotate(1.5deg)",
      },
      image: { filter: "saturate(1.08) contrast(1.04)" },
      copy: {
        boxSizing: "border-box",
        color: palette.panel,
        transform: "rotate(-1.2deg)",
        background: palette.paper,
        border: `3px solid ${palette.panel}`,
        boxShadow: `7px 7px 0 ${palette["accent-2"]}`,
        padding: "3.5%",
      },
      headline: {
        fontFamily: palette["font-head"],
        fontWeight: 900,
        textTransform: "uppercase",
        textShadow: `3px 3px 0 ${palette["panel-2"]}`,
      },
      body: { color: palette.panel, fontWeight: 700 },
      rule: { background: palette.accent, height: 5, borderRadius: 0 },
      indicator: {
        background: palette.accent,
        borderRadius: "50% 50% 0 50%",
        transform: "rotate(20deg)",
      },
    };
  if (direction === "tech")
    return {
      ...base,
      stage: {
        backgroundColor: palette.panel,
        backgroundImage: `linear-gradient(${palette.grid} 1px,transparent 1px),linear-gradient(90deg,${palette.grid} 1px,transparent 1px)`,
        backgroundSize: "20px 20px",
      },
      media: { border: `1px solid ${palette.line}`, borderRadius: 7 },
      image: { filter: "saturate(.78) contrast(1.08)" },
      copy: { color: palette.fg },
      headline: { fontFamily: palette["font-head"], fontWeight: 650 },
      body: { color: palette.muted, fontFamily: palette["font-num"] },
      rule: {
        background: palette.accent,
        boxShadow: `0 0 8px ${palette.accent}`,
      },
      indicator: {
        background: palette.accent,
        borderRadius: 0,
        boxShadow: `0 0 10px ${palette.accent}`,
      },
    };
  if (direction === "collage")
    return {
      ...base,
      stage: {
        backgroundColor: palette.paper,
        backgroundImage: `radial-gradient(${palette.grid} 1px,transparent 1px)`,
        backgroundSize: "6px 6px",
      },
      media: {
        clipPath: "polygon(2% 1%,99% 0,96% 99%,0 96%)",
        boxShadow: `8px 9px 0 ${palette.panel}`,
        transform: "rotate(1.2deg)",
      },
      image: { filter: "grayscale(1) contrast(1.22)" },
      copy: {
        color: palette.panel,
        background: palette.paper,
        padding: 9,
        transform: "rotate(-1.5deg)",
        boxShadow: `6px 7px 0 ${palette.panel}`,
      },
      headline: {
        fontFamily: palette["font-head"],
        fontWeight: 900,
        textTransform: "uppercase",
      },
      body: { color: palette.panel },
      rule: { background: palette.accent, height: 5 },
      indicator: {
        background: palette.accent,
        borderRadius: 0,
        transform: "rotate(12deg)",
      },
    };
  if (direction === "brutalist")
    return {
      ...base,
      stage: {
        background: palette.paper,
        border: `3px solid ${palette.panel}`,
      },
      media: {
        border: `3px solid ${palette.panel}`,
        boxShadow: `7px 7px 0 ${palette.panel}`,
      },
      image: { filter: "contrast(1.12) saturate(.9)" },
      copy: { color: palette.panel },
      headline: {
        fontFamily: palette["font-head"],
        fontWeight: 950,
        textTransform: "uppercase",
        lineHeight: 0.84,
      },
      body: { color: palette.panel, fontWeight: 700 },
      rule: {
        background: palette.accent,
        height: 6,
        border: `1px solid ${palette.panel}`,
      },
      indicator: {
        background: palette.accent,
        borderRadius: 0,
        border: `2px solid ${palette.panel}`,
      },
    };
  if (direction === "organic")
    return {
      ...base,
      stage: { background: palette.panel },
      media: {
        borderRadius: "42% 58% 48% 52% / 34% 44% 56% 66%",
        boxShadow: palette.shadow,
      },
      image: { filter: "saturate(.84) contrast(.98)" },
      copy: { color: palette.fg },
      headline: { fontFamily: palette["font-head"], fontWeight: 550 },
      body: { color: palette.muted },
      rule: { background: palette.accent, height: 4, borderRadius: 999 },
      indicator: {
        background: palette.accent,
        borderRadius: "60% 40% 55% 45%",
      },
    };
  return base;
}

function DirectionSceneDecor({
  direction,
  palette,
}: {
  direction: ReturnType<typeof visualDirectionKind>;
  palette: Record<string, string>;
}) {
  if (direction === "neutral") return null;
  if (direction === "editorial")
    return (
      <>
        <span
          className="absolute inset-y-[7%] left-[3%] w-px"
          style={{ background: palette.line }}
        />
        <span
          className="absolute right-[3%] top-[7%] font-mono text-[7px]"
          style={{ color: palette.muted }}
        >
          ISSUE 01 / 2026
        </span>
      </>
    );
  if (direction === "memphis")
    return (
      <>
        <span
          className="absolute -bottom-[20%] -left-[8%] h-[52%] aspect-square rounded-full border-[3px] bg-transparent"
          style={{ borderColor: palette.panel }}
        />
        <span
          className="absolute left-[4%] top-[8%] h-[16%] w-[11%] -rotate-12"
          style={{
            background: palette.accent,
            clipPath: "polygon(50% 0,100% 100%,0 100%)",
          }}
        />
        <span
          className="absolute bottom-[8%] left-[40%] h-[12%] w-[13%] rotate-12 border-[3px]"
          style={{
            background: palette["accent-2"],
            borderColor: palette.panel,
          }}
        />
        <span
          className="absolute right-[4%] top-[7%] h-[17%] w-[16%] -rotate-6 border-[3px] border-b-0 rounded-t-full"
          style={{ background: palette["panel-2"], borderColor: palette.panel }}
        />
        <span
          className="absolute right-[4%] top-[34%] h-[19%] w-[13%] opacity-65"
          style={{
            backgroundImage: `radial-gradient(${palette.panel} 1.8px,transparent 1.8px)`,
            backgroundSize: "9px 9px",
          }}
        />
        <svg
          aria-hidden
          className="absolute bottom-[7%] left-[7%] h-[8%] w-[25%] overflow-visible"
          viewBox="0 0 220 50"
        >
          <polyline
            points="0,40 28,8 56,40 84,8 112,40 140,8 168,40 196,8 220,34"
            fill="none"
            stroke={palette["accent-2"]}
            strokeWidth="10"
            strokeLinejoin="round"
          />
        </svg>
      </>
    );
  if (direction === "tech")
    return (
      <>
        <span
          className="absolute left-[3%] top-[5%] h-5 w-5 border-l border-t"
          style={{ borderColor: palette.accent }}
        />
        <span
          className="absolute bottom-[5%] right-[3%] h-5 w-5 border-b border-r"
          style={{ borderColor: palette.accent }}
        />
      </>
    );
  if (direction === "collage")
    return (
      <>
        <span
          className="absolute -left-[4%] top-[18%] h-[58%] w-[24%] rotate-6"
          style={{
            background: palette.accent,
            clipPath: "polygon(3% 0,100% 4%,94% 97%,0 100%)",
          }}
        />
        <span
          className="absolute bottom-[3%] right-[8%] h-10 w-24 -rotate-3"
          style={{
            background: palette["accent-2"],
            clipPath: "polygon(2% 5%,100% 0,96% 91%,0 100%)",
          }}
        />
      </>
    );
  if (direction === "brutalist")
    return (
      <>
        <span
          className="absolute right-0 top-0 h-[18%] w-[24%] border-b-2 border-l-2"
          style={{ background: palette.accent, borderColor: palette.panel }}
        />
        <span
          className="absolute bottom-[5%] left-[3%] font-mono text-[7px] font-bold"
          style={{ color: palette.panel }}
        >
          STRUCTURE / 01
        </span>
      </>
    );
  return (
    <>
      <span
        className="absolute -left-[18%] -top-[35%] h-[88%] aspect-square opacity-70"
        style={{
          background: palette.accent,
          borderRadius: "42% 58% 64% 36% / 45% 32% 68% 55%",
        }}
      />
      <span
        className="absolute -bottom-[30%] right-[-8%] h-[72%] aspect-square border opacity-50"
        style={{
          borderColor: palette["accent-2"],
          borderRadius: "61% 39% 45% 55% / 38% 62% 38% 62%",
        }}
      />
    </>
  );
}

function MotionGraphicPreviewCard({
  style,
  directionId,
  palette,
  sample,
  animate = false,
}: {
  style: CustomVisualStyle;
  directionId: string;
  palette: Record<string, string>;
  sample: MotionGraphicSample;
  animate?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const update = () => {
      const next = Math.floor(shell.getBoundingClientRect().width);
      if (next > 0)
        setPreviewWidth((current) => (current === next ? current : next));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  const direction = visualDirectionKind(directionId);
  const box = motionGraphicPreviewBox(style, sample.kind);
  const customPreviewKinds: readonly MotionGraphicKind[] = [
    "line",
    "funnel",
    "cycle",
    "document",
    "phone",
    "browser",
    "map",
  ];
  const block =
    direction !== "neutral" || customPreviewKinds.includes(sample.kind)
      ? visualDirectionMotionBlock(
          directionId,
          sample.kind,
          box,
          motionGraphicDirectionPreviewCopy(direction),
        )
      : motionGraphicSampleBlock(directionId, sample, box);
  const previewComp: Composition = {
    width: 1920,
    height: 1080,
    theme: "general",
    video: null,
    blocks: [],
    shots: [],
    palette: { ...palette },
  };
  return (
    <div
      ref={shellRef}
      data-motion-preview
      className="aspect-video w-full overflow-hidden bg-black"
    >
      {previewWidth > 0 ? (
        <InlineBlockPreview
          comp={previewComp}
          block={block}
          width={previewWidth}
          animate={animate}
          ground="stage"
          backdrop={
            <MotionGraphicSceneBackdrop
              style={style}
              directionId={directionId}
              palette={palette}
            />
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Thumbnail rail stays intentionally lightweight: the selected large sample is the
 * only live iframe. At 82px the full preview document is unreadable anyway, while
 * mounting a document and ResizeObserver for every sample made direction changes
 * rebuild a wall of iframes. These miniatures preserve both the direction grammar
 * and the Motion Graphic category without carrying a second rendering runtime.
 */
function MotionGraphicThumbnail({
  directionId,
  palette,
  sample,
}: {
  directionId: string;
  palette: Record<string, string>;
  sample: MotionGraphicSample;
}) {
  const direction = visualDirectionKind(directionId);
  const lightField = ["editorial", "memphis", "collage", "brutalist"].includes(
    direction,
  );
  const ink = lightField ? palette.panel : palette.fg;
  return (
    <span
      data-motion-thumbnail={sample.kind}
      className="relative block aspect-video w-full overflow-hidden"
      style={{ background: lightField ? palette.paper : palette.panel }}
    >
      <span className="absolute inset-0 opacity-55">
        <VisualDirectionThumbnail directionId={directionId} palette={palette} />
      </span>
      <MotionGraphicThumbnailGlyph
        kind={sample.kind}
        ink={ink}
        accent={palette.accent}
        accent2={palette["accent-2"] ?? palette.accent}
        panel={palette.panel}
      />
    </span>
  );
}

function MotionGraphicThumbnailGlyph({
  kind,
  ink,
  accent,
  accent2,
  panel,
}: {
  kind: MotionGraphicKind;
  ink: string;
  accent: string;
  accent2: string;
  panel: string;
}) {
  if (kind === "words")
    return (
      <span className="absolute inset-0 flex flex-col justify-center px-2">
        <b
          className="text-[9px] font-black leading-[0.82] tracking-[-0.06em]"
          style={{ color: ink }}
        >
          MOVE
          <br />
          IDEAS
        </b>
        <i className="mt-1 block h-0.5 w-5" style={{ background: accent }} />
      </span>
    );
  if (kind === "number")
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <b
          className="font-mono text-[20px] font-black tracking-[-0.12em]"
          style={{ color: ink }}
        >
          72
        </b>
        <i
          className="ml-0.5 mt-[-8px] text-[6px] not-italic"
          style={{ color: accent }}
        >
          %
        </i>
      </span>
    );
  if (kind === "comparison")
    return (
      <span className="absolute inset-0 flex items-center justify-center gap-1.5 px-2">
        <i className="h-5 w-5 border" style={{ borderColor: ink }} />
        <b className="text-[5px]" style={{ color: accent }}>
          VS
        </b>
        <i
          className="h-5 w-5 border-2"
          style={{ borderColor: accent, background: accent2 }}
        />
      </span>
    );
  if (kind === "donut")
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <i
          className="grid h-7 w-7 place-items-center rounded-full border-[5px]"
          style={{ borderColor: accent, borderLeftColor: `${ink}33` }}
        >
          <b className="text-[5px] not-italic" style={{ color: ink }}>
            72
          </b>
        </i>
      </span>
    );
  if (kind === "line")
    return (
      <svg
        aria-hidden
        className="absolute inset-x-2 bottom-2 h-7 w-[calc(100%-16px)] overflow-visible"
        viewBox="0 0 64 28"
      >
        <polyline
          points="0,24 13,18 25,20 39,9 51,12 64,2"
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (kind === "funnel")
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        {[44, 32, 20].map((width, index) => (
          <i
            key={width}
            className="block h-1.5"
            style={{ width, background: index === 2 ? accent : ink }}
          />
        ))}
      </span>
    );
  if (kind === "data")
    return (
      <span className="absolute inset-x-2 bottom-2 flex h-7 items-end gap-1.5">
        {[11, 20, 15, 26].map((height, index) => (
          <i
            key={`${height}-${index}`}
            className="flex-1"
            style={{ height, background: index === 3 ? accent : ink }}
          />
        ))}
      </span>
    );
  if (["steps", "timeline", "flow", "cycle"].includes(kind))
    return (
      <span className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 items-center justify-between">
        {[0, 1, 2].map((index) => (
          <span key={index} className="flex flex-1 items-center last:flex-none">
            <i
              className="block h-2.5 w-2.5 rounded-full border-2"
              style={{
                borderColor: index === 2 ? accent : ink,
                background: index === 2 ? accent : panel,
              }}
            />
            {index < 2 ? (
              <i className="mx-1 h-px flex-1" style={{ background: ink }} />
            ) : null}
          </span>
        ))}
      </span>
    );
  if (kind === "phone")
    return (
      <span
        className="absolute bottom-1.5 left-1/2 top-1.5 w-5 -translate-x-1/2 rounded-sm border-2"
        style={{ borderColor: ink, background: `${accent}55` }}
      >
        <i
          className="absolute inset-x-1 bottom-1 h-0.5"
          style={{ background: accent }}
        />
      </span>
    );
  if (kind === "browser" || kind === "document")
    return (
      <span
        className={`absolute inset-x-2 border-2 ${kind === "browser" ? "bottom-2 top-2" : "bottom-1.5 left-3 right-3 top-1.5"}`}
        style={{ borderColor: ink, background: `${panel}cc` }}
      >
        <i className="block h-1.5 w-full" style={{ background: accent }} />
        <i className="mx-1.5 mt-1.5 block h-0.5 w-2/3" style={{ background: ink }} />
        <i className="mx-1.5 mt-1 block h-0.5 w-1/2" style={{ background: `${ink}88` }} />
      </span>
    );
  if (kind === "map")
    return (
      <svg
        aria-hidden
        className="absolute inset-1.5 h-[calc(100%-12px)] w-[calc(100%-12px)]"
        viewBox="0 0 70 34"
      >
        <path
          d="M2 28C15 22 18 9 30 15S43 28 52 17 61 7 68 10"
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />
        <circle cx="2" cy="28" r="3" fill={ink} />
        <circle cx="68" cy="10" r="3" fill={accent2} />
      </svg>
    );
  if (kind === "overlay")
    return (
      <span className="absolute bottom-2 left-2 flex items-stretch">
        <i className="w-1" style={{ background: accent }} />
        <span className="px-1.5 py-1" style={{ background: panel }}>
          <b className="block h-1 w-8" style={{ background: ink }} />
          <i className="mt-1 block h-0.5 w-5" style={{ background: `${ink}88` }} />
        </span>
      </span>
    );
  return (
    <span className="absolute inset-0 grid place-items-center">
      <b className="text-[16px] font-black" style={{ color: ink }}>
        P
      </b>
      <i
        className="absolute bottom-2 h-0.5 w-7"
        style={{ background: accent }}
      />
    </span>
  );
}

function MotionGraphicSceneBackdrop({
  style,
  directionId,
  palette,
}: {
  style: CustomVisualStyle;
  directionId: string;
  palette: Record<string, string>;
}) {
  const zones = previewSafeZones(style);
  const direction = visualDirectionKind(directionId);
  const treatment = talkingHeadTreatment(direction, palette, style.layout);
  return (
    <div className="absolute inset-0 overflow-hidden" style={treatment.stage}>
      <div
        className={`absolute overflow-hidden ${style.layout === "presenter-corner" ? "rounded-lg shadow-2xl" : ""}`}
        style={{
          ...normalizedBoxStyle(zones.media),
          ...(style.layout === "smart" ? {} : treatment.media),
        }}
      >
        <img
          src={PRESENTER_PREVIEW}
          alt=""
          className="h-full w-full object-cover object-center"
          style={treatment.image}
        />
        <span className="absolute inset-0" style={treatment.imageOverlay} />
      </div>
      <DirectionSceneDecor direction={direction} palette={palette} />
    </div>
  );
}

type PreviewBox = NonNullable<Block["box"]>;

export interface PreviewSafeZones {
  /** Actual media window. In smart mode footage fills the frame. */
  media: PreviewBox;
  /** Occupied person/face region, distinct from a full-frame media window. */
  subject: PreviewBox;
  /** Only region where authored graphics and headline copy may be placed. */
  content: PreviewBox;
  /** Reserved sentence-caption band. */
  captions: PreviewBox;
}

function normalizedBoxStyle(box: PreviewBox): CSSProperties {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}

/** One deterministic preview geometry shared by the hero sample and every
 * Motion Graphic sample. The known presenter image is right-weighted, so smart
 * mode protects that subject while fixed layouts reserve the selected plane. */
export function previewSafeZones(style: CustomVisualStyle): PreviewSafeZones {
  const captions = { x: 0.18, y: 0.84, w: 0.64, h: 0.1 };
  if (style.layout === "split-top-bottom") {
    return style.topBottomPresenter === "top"
      ? {
          media: { x: 0, y: 0, w: 1, h: 0.5 },
          subject: { x: 0, y: 0, w: 1, h: 0.5 },
          content: { x: 0.06, y: 0.55, w: 0.88, h: 0.24 },
          captions,
        }
      : {
          media: { x: 0, y: 0.5, w: 1, h: 0.5 },
          subject: { x: 0, y: 0.5, w: 1, h: 0.5 },
          content: { x: 0.06, y: 0.08, w: 0.88, h: 0.34 },
          captions,
        };
  }
  if (style.layout === "split-left-right") {
    return style.leftRightPresenter === "left"
      ? {
          media: { x: 0, y: 0, w: 0.5, h: 1 },
          subject: { x: 0, y: 0, w: 0.5, h: 0.82 },
          content: { x: 0.55, y: 0.1, w: 0.39, h: 0.67 },
          captions,
        }
      : {
          media: { x: 0.5, y: 0, w: 0.5, h: 1 },
          subject: { x: 0.5, y: 0, w: 0.5, h: 0.82 },
          content: { x: 0.06, y: 0.1, w: 0.39, h: 0.67 },
          captions,
        };
  }
  if (style.layout === "presenter-corner") {
    const media: Record<PresenterCornerId, PreviewBox> = {
      "top-left": { x: 0.04, y: 0.07, w: 0.28, h: 0.38 },
      "top-right": { x: 0.68, y: 0.07, w: 0.28, h: 0.38 },
      "bottom-left": { x: 0.04, y: 0.43, w: 0.28, h: 0.38 },
      "bottom-right": { x: 0.68, y: 0.43, w: 0.28, h: 0.38 },
    };
    const presenter = media[style.presenterCorner];
    return {
      media: presenter,
      subject: presenter,
      content: style.presenterCorner.endsWith("left")
        ? { x: 0.38, y: 0.1, w: 0.56, h: 0.67 }
        : { x: 0.06, y: 0.1, w: 0.56, h: 0.67 },
      captions,
    };
  }
  return {
    media: { x: 0, y: 0, w: 1, h: 1 },
    subject: { x: 0.46, y: 0.06, w: 0.38, h: 0.76 },
    content: { x: 0.055, y: 0.12, w: 0.37, h: 0.62 },
    captions,
  };
}

export function motionGraphicPreviewBox(
  style: CustomVisualStyle,
  kind: MotionGraphicKind,
): PreviewBox {
  const { content, captions } = previewSafeZones(style);
  if (kind !== "overlay") return content;
  const h = Math.min(0.16, content.h);
  return {
    x: content.x,
    y: Math.min(content.y + content.h - h, captions.y - h - 0.035),
    w: Math.min(content.w, 0.54),
    h,
  };
}

function motionGraphicDirectionPreviewCopy(
  direction: VisualDirectionKind,
): MotionGraphicPreviewCopy {
  const copy = directionSampleCopy(direction);
  return {
    words: copy.words,
    wordsSupport: copy.support,
    numberLabel: copy.metricLabel,
    numberNote: copy.metricNote,
    dataTitle: copy.dataTitle,
    dataHook: t("customFrame.dataHook"),
    dataProof: t("customFrame.dataProof"),
    dataAction: t("customFrame.dataAction"),
    overlayName: t("customFrame.overlayName"),
    overlayRole: t("customFrame.overlayRole"),
    brandLine: t("customFrame.brandLine"),
    sourceHeadline: t("customFrame.sourceHeadline"),
    sourceFocus: t("customFrame.sourceFocus"),
    before: copy.before,
    after: copy.after,
    stageOne: copy.stages[0],
    stageTwo: copy.stages[1],
    stageThree: copy.stages[2],
    documentTitle: t("customFrame.documentTitle"),
    interfaceTitle: t("customFrame.interfaceTitle"),
    mapStart: t("customFrame.mapStart"),
    mapEnd: t("customFrame.mapEnd"),
  };
}

function motionGraphicSampleBlock(
  directionId: string,
  sample: MotionGraphicSample,
  box: PreviewBox,
): Block {
  const direction = visualDirectionKind(directionId);
  return {
    id: `visual_sample_${sample.id.replace(/[^a-z0-9]+/g, "_")}`,
    templateId: `kit:${sample.kit}`,
    slots: { props: motionGraphicSampleProps(sample.id, direction) },
    startSec: 0,
    durationSec: sample.kind === "overlay" ? 3.4 : 4,
    trackIndex: 2,
    box,
    label: sample.id,
    ...(direction === "collage"
      ? { rotation: -1.1 }
      : direction === "memphis"
        ? { rotation: -0.45 }
        : {}),
  };
}

interface DirectionSampleCopy {
  words: string;
  support: string;
  metricValue: string;
  metricLabel: string;
  metricNote: string;
  dataTitle: string;
  before: string;
  after: string;
  stages: [string, string, string];
  values: [string, string, string, string];
  series: [number, number, number];
}

function directionSampleCopy(
  direction: VisualDirectionKind,
): DirectionSampleCopy {
  const shared = {
    metricLabel: t("customFrame.numberLabel"),
    metricNote: t("customFrame.numberNote"),
    dataTitle: t("customFrame.dataTitle"),
    before: t("customFrame.before"),
    after: t("customFrame.after"),
    stages: [
      t("customFrame.stageOne"),
      t("customFrame.stageTwo"),
      t("customFrame.stageThree"),
    ] as [string, string, string],
  };
  if (direction === "editorial")
    return {
      ...shared,
      words: t("customFrame.quoteText"),
      support: t("customFrame.quoteSupport"),
      metricValue: "38%",
      metricLabel: t("customFrame.metricLabel"),
      metricNote: t("customFrame.metricNote"),
      before: t("customFrame.compareOriginal"),
      after: t("customFrame.compareFinal"),
      values: ["38%", "12:40", "4:18", "01"],
      series: [38, 72, 91],
    };
  if (direction === "memphis")
    return {
      ...shared,
      words: t("customFrame.brandLine"),
      support: t("customFrame.wordsSupport"),
      metricValue: "3.4×",
      values: ["3.4×", "86%", "42s", "18K"],
      series: [91, 64, 78],
    };
  if (direction === "tech")
    return {
      ...shared,
      words: t("customFrame.sourceHeadline"),
      support: t("customFrame.sourceFocus"),
      metricValue: "12ms",
      metricLabel: t("customFrame.dataAction"),
      values: ["12ms", "99.2%", "3.4×", "24/7"],
      series: [99, 72, 46],
    };
  if (direction === "collage")
    return {
      ...shared,
      words: t("customFrame.quoteText"),
      support: t("customFrame.quoteSupport"),
      metricValue: "20万",
      metricLabel: t("customFrame.dataHook"),
      values: ["20万", "2.4×", "86%", "42s"],
      series: [82, 56, 94],
    };
  if (direction === "brutalist")
    return {
      ...shared,
      words: t("customFrame.compareNote"),
      support: t("customFrame.wordsSupport"),
      metricValue: "4.7×",
      values: ["4.7×", "86%", "42s", "18K"],
      series: [94, 52, 73],
    };
  if (direction === "organic")
    return {
      ...shared,
      words: t("customFrame.previewHeadline"),
      support: t("customFrame.previewSubhead"),
      metricValue: "72%",
      values: ["72%", "2.4×", "42s", "18K"],
      series: [72, 28, 54],
    };
  return {
    ...shared,
    words: t("customFrame.wordsText"),
    support: t("customFrame.wordsSupport"),
    metricValue: "72%",
    values: ["2.4×", "86%", "42s", "18K"],
    series: [86, 68, 42],
  };
}

function motionGraphicSampleProps(
  id: string,
  direction: ReturnType<typeof visualDirectionKind>,
): Record<string, unknown> {
  const copy = directionSampleCopy(direction);
  const surfaceByDirection: Record<
    ReturnType<typeof visualDirectionKind>,
    Record<string, string>
  > = {
    neutral: { border: "none", radius: "soft" },
    editorial: { border: "none", radius: "sharp" },
    memphis: { border: "none", radius: "soft" },
    tech: { border: "none", radius: "soft" },
    collage: { border: "none", radius: "sharp" },
    brutalist: { border: "none", radius: "sharp" },
    organic: { border: "none", radius: "round" },
  };
  const commonCard = { surface: "none", ...surfaceByDirection[direction] };
  // Kit components provide information structure, not the art direction itself.
  // Pick a direction-appropriate staging before the Frame palette, surfaces and
  // scene treatment are applied; bespoke generated Motion Graphics remain free
  // to go beyond these representative component variants.
  const variant = {
    calloutPoster: {
      neutral: "poster",
      editorial: "quote",
      memphis: "stamp",
      tech: "poster",
      collage: "stamp",
      brutalist: "stamp",
      organic: "quote",
    },
    calloutQuote: {
      neutral: "quote",
      editorial: "quote",
      memphis: "poster",
      tech: "quote",
      collage: "quote",
      brutalist: "poster",
      organic: "quote",
    },
    metric: {
      neutral: "split-editorial",
      editorial: "split-editorial",
      memphis: "badge",
      tech: "split-editorial",
      collage: "badge",
      brutalist: "hero-number",
      organic: "badge",
    },
    kpi: {
      neutral: "grid",
      editorial: "row",
      memphis: "grid",
      tech: "grid",
      collage: "grid",
      brutalist: "row",
      organic: "grid",
    },
    comparison: {
      neutral: "columns",
      editorial: "columns",
      memphis: "versus",
      tech: "columns",
      collage: "columns",
      brutalist: "versus",
      organic: "columns",
    },
    bars: {
      neutral: "bars",
      editorial: "bars",
      memphis: "columns",
      tech: "bars",
      collage: "columns",
      brutalist: "bars",
      organic: "donut",
    },
    stepsList: {
      neutral: "list",
      editorial: "timeline",
      memphis: "pipeline",
      tech: "pipeline",
      collage: "list",
      brutalist: "list",
      organic: "timeline",
    },
    stepsFlow: {
      neutral: "pipeline",
      editorial: "timeline",
      memphis: "pipeline",
      tech: "pipeline",
      collage: "list",
      brutalist: "pipeline",
      organic: "timeline",
    },
    stepsTimeline: {
      neutral: "timeline",
      editorial: "timeline",
      memphis: "list",
      tech: "timeline",
      collage: "list",
      brutalist: "list",
      organic: "timeline",
    },
    lowerThird: {
      neutral: "clean-bar",
      editorial: "accent-underline",
      memphis: "stack-bars",
      tech: "kicker",
      collage: "stack-bars",
      brutalist: "color-block",
      organic: "soft-pill",
    },
    title: {
      neutral: "section",
      editorial: "section",
      memphis: "hero",
      tech: "section",
      collage: "section",
      brutalist: "hero",
      organic: "hero",
    },
  } as const;
  if (id === "callout-poster")
    return {
      variant: variant.calloutPoster[direction],
      text: copy.words,
      support: copy.support,
      surface: "none",
    };
  if (id === "callout-quote")
    return {
      variant: variant.calloutQuote[direction],
      text: copy.words,
      support: copy.support,
      surface: "none",
    };
  if (id === "metric")
    return {
      ...commonCard,
      variant: variant.metric[direction],
      value: copy.metricValue,
      label: copy.metricLabel,
      note: copy.metricNote,
      trend: "up",
    };
  if (id === "kpi")
    return {
      ...commonCard,
      variant: variant.kpi[direction],
      cells: [
        {
          label: t("customFrame.dataHook"),
          value: copy.values[0],
          trend: "up",
        },
        {
          label: t("customFrame.dataProof"),
          value: copy.values[1],
          trend: "up",
        },
        {
          label: t("customFrame.dataAction"),
          value: copy.values[2],
          trend: "down",
        },
        {
          label: t("customFrame.numberLabel"),
          value: copy.values[3],
          trend: "none",
        },
      ],
    };
  if (id === "comparison")
    return {
      ...commonCard,
      variant: variant.comparison[direction],
      aLabel: copy.before,
      aValue: "42%",
      bLabel: copy.after,
      bValue: "72%",
      winner: "b",
    };
  if (id === "chart-bars")
    return {
      ...commonCard,
      variant: variant.bars[direction],
      title: copy.dataTitle,
      unit: "%",
      series: [
        { label: t("customFrame.dataHook"), value: copy.series[0] },
        { label: t("customFrame.dataProof"), value: copy.series[1] },
        { label: t("customFrame.dataAction"), value: copy.series[2] },
      ],
    };
  if (id === "chart-donut")
    return {
      ...commonCard,
      variant: "donut",
      title: t("customFrame.dataTitle"),
      series: [
        { label: t("customFrame.dataHook"), value: 72 },
        { label: t("customFrame.dataProof"), value: 28 },
      ],
      highlight: 0,
    };
  if (id === "steps-list")
    return {
      ...commonCard,
      variant: variant.stepsList[direction],
      items: [
        { text: copy.stages[0] },
        { text: copy.stages[1] },
        { text: copy.stages[2] },
      ],
    };
  if (id === "steps-flow")
    return {
      ...commonCard,
      variant: variant.stepsFlow[direction],
      items: [
        { text: copy.stages[0] },
        { text: copy.stages[1] },
        { text: copy.stages[2] },
      ],
    };
  if (id === "steps-timeline")
    return {
      ...commonCard,
      variant: variant.stepsTimeline[direction],
      items: [
        { text: copy.stages[0] },
        { text: copy.stages[1] },
        { text: copy.stages[2] },
      ],
    };
  if (id === "lower-third")
    return {
      variant: variant.lowerThird[direction],
      title: t("customFrame.overlayName"),
      subtitle: t("customFrame.overlayRole"),
    };
  return {
    variant: variant.title[direction],
    index: "01",
    title: t("customFrame.sourceHeadline"),
    sub: t("customFrame.brandLine"),
  };
}
