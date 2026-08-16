/**
 * User-composed controls layered over a visual direction.
 *
 * Keep this deliberately small and enumerable. It is persisted in the project,
 * sent across the hosted/BYO boundaries, and compiled into one deterministic
 * art-direction contract. The dimensions are independent by product design:
 * every combination is valid and explicit user choice wins over a preset's
 * conventional pairing.
 */

import { CAPTION_PRESETS, getCaptionPreset } from "./caption-presets";

export const CUSTOM_VISUAL_STYLE_VERSION = 1 as const;
export const CUSTOM_FRAME_ID = "custom-visual-style" as const;

export const CUSTOM_VISUAL_STYLE_IDS = {
  palette: [
    "monochrome",
    "cobalt",
    "ember",
    "forest",
    "sand",
    "violet",
  ] as const,
  captionPreset: CAPTION_PRESETS.map((preset) => preset.id),
  layout: [
    "smart",
    "split-top-bottom",
    "split-left-right",
    "presenter-corner",
  ] as const,
  topBottomPresenter: ["top", "bottom"] as const,
  leftRightPresenter: ["left", "right"] as const,
  presenterCorner: [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ] as const,
};

export type CustomPaletteId = (typeof CUSTOM_VISUAL_STYLE_IDS.palette)[number];
export type CustomLayoutId = (typeof CUSTOM_VISUAL_STYLE_IDS.layout)[number];
export type TopBottomPresenterId =
  (typeof CUSTOM_VISUAL_STYLE_IDS.topBottomPresenter)[number];
export type LeftRightPresenterId =
  (typeof CUSTOM_VISUAL_STYLE_IDS.leftRightPresenter)[number];
export type PresenterCornerId =
  (typeof CUSTOM_VISUAL_STYLE_IDS.presenterCorner)[number];

export interface CustomVisualStyle {
  version: typeof CUSTOM_VISUAL_STYLE_VERSION;
  palette: CustomPaletteId;
  /** An id from the product's real caption preset catalog. */
  captionPreset: string;
  layout: CustomLayoutId;
  topBottomPresenter: TopBottomPresenterId;
  leftRightPresenter: LeftRightPresenterId;
  /** Secondary choice used only by the presenter-corner layout. */
  presenterCorner: PresenterCornerId;
}

export const DEFAULT_CUSTOM_VISUAL_STYLE: CustomVisualStyle = {
  version: CUSTOM_VISUAL_STYLE_VERSION,
  palette: "monochrome",
  captionPreset: "em-yellow",
  layout: "smart",
  topBottomPresenter: "bottom",
  leftRightPresenter: "right",
  presenterCorner: "bottom-right",
};

export const CUSTOM_STYLE_PALETTES: Record<
  CustomPaletteId,
  Record<string, string>
> = {
  monochrome: {
    paper: "#F1F0EC",
    panel: "#191919",
    "panel-2": "#2A2A2A",
    fg: "#F1F0EC",
    muted: "#A5A39E",
    accent: "#F1F0EC",
    "accent-2": "#A5A39E",
    line: "#F1F0EC38",
    grid: "#F1F0EC12",
    radius: "8px",
    shadow: "0 14px 34px rgb(0 0 0 / 0.28)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
  cobalt: {
    paper: "#EEF1F7",
    panel: "#14213D",
    "panel-2": "#20345F",
    fg: "#F6F8FC",
    muted: "#AEB8CE",
    accent: "#3D72F2",
    "accent-2": "#BFD0FF",
    line: "#BFD0FF45",
    grid: "#BFD0FF14",
    radius: "8px",
    shadow: "0 14px 34px rgb(4 13 34 / 0.32)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
  ember: {
    paper: "#F3EEE9",
    panel: "#211815",
    "panel-2": "#38241F",
    fg: "#F8F2ED",
    muted: "#BEAAA1",
    accent: "#D9573F",
    "accent-2": "#F1B49E",
    line: "#F1B49E40",
    grid: "#F1B49E12",
    radius: "6px",
    shadow: "0 14px 34px rgb(27 10 5 / 0.32)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
  forest: {
    paper: "#EDF0E8",
    panel: "#14231C",
    "panel-2": "#21382D",
    fg: "#F2F5EE",
    muted: "#A9B9AE",
    accent: "#4E9B6F",
    "accent-2": "#B9D7C2",
    line: "#B9D7C240",
    grid: "#B9D7C212",
    radius: "8px",
    shadow: "0 14px 34px rgb(4 20 11 / 0.3)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
  sand: {
    paper: "#EAE0CE",
    panel: "#25201A",
    "panel-2": "#3A3127",
    fg: "#F4EBDD",
    muted: "#C1B39E",
    accent: "#C6944C",
    "accent-2": "#E4C89B",
    line: "#E4C89B40",
    grid: "#E4C89B12",
    radius: "4px",
    shadow: "0 14px 34px rgb(25 18 9 / 0.3)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
  violet: {
    paper: "#F0EDF4",
    panel: "#1D1925",
    "panel-2": "#30283D",
    fg: "#F6F2FA",
    muted: "#B9AEC7",
    accent: "#8C62C7",
    "accent-2": "#D2BCEB",
    line: "#D2BCEB40",
    grid: "#D2BCEB12",
    radius: "10px",
    shadow: "0 14px 34px rgb(13 7 22 / 0.32)",
    glow: "0 0 0 transparent",
    "font-head": "'Geist Variable', 'Noto Sans SC', sans-serif",
    "font-num": "'JetBrains Mono Variable', monospace",
  },
};

interface HslColor {
  h: number;
  s: number;
  l: number;
  alpha: string;
}

function hexToHsl(value: string | undefined): HslColor | null {
  const match = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(value ?? "");
  if (!match) return null;
  const raw = match[1]!;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l, alpha: match[2] ?? "" };
}

function hslToHex({ h, s, l, alpha }: HslColor): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  const byte = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${byte(r1)}${byte(g1)}${byte(b1)}${alpha.toUpperCase()}`;
}

function shiftedDirectionColor(
  value: string | undefined,
  hueShift: number,
): string | undefined {
  const hsl = hexToHsl(value);
  // Neutral paper/ink roles stay neutral. Authored chromatic roles move as one
  // system so their relative hue, saturation, and lightness relationships live on.
  if (!hsl || hsl.s < 0.14) return value;
  return hslToHex({ ...hsl, h: hsl.h + hueShift });
}

function glowFor(
  accent: string,
  original: string | undefined,
): string | undefined {
  if (!original || original.includes("transparent")) return original;
  const match = /^#([\da-f]{6})/i.exec(accent);
  if (!match) return original;
  const raw = match[1]!;
  const rgb = [0, 2, 4]
    .map((index) => parseInt(raw.slice(index, index + 2), 16))
    .join(" ");
  return `0 0 28px rgb(${rgb} / .25)`;
}

/** A user color choice steers a Frame; it does not replace the Frame's color
 * grammar. Memphis red/teal/pink can become blue/orange/lilac while remaining
 * multicolor. `monochrome` means the authored theme colors when a Frame exists. */
export function resolveVisualDirectionPalette(
  directionPalette: Record<string, string> | null | undefined,
  style: CustomVisualStyle,
): Record<string, string> {
  const selected = CUSTOM_STYLE_PALETTES[style.palette];
  if (!directionPalette) return { ...selected };
  if (style.palette === "monochrome") return { ...directionPalette };

  const sourceAccent = hexToHsl(directionPalette.accent);
  const selectedAccent = hexToHsl(selected.accent);
  if (
    !sourceAccent ||
    !selectedAccent ||
    sourceAccent.s < 0.14 ||
    selectedAccent.s < 0.14
  ) {
    return { ...directionPalette };
  }
  const hueShift = selectedAccent.h - sourceAccent.h;
  const palette = { ...directionPalette };
  for (const role of ["accent", "accent-2", "panel-2"] as const) {
    palette[role] =
      shiftedDirectionColor(directionPalette[role], hueShift) ??
      directionPalette[role]!;
  }
  palette.glow =
    glowFor(palette.accent!, directionPalette.glow) ?? directionPalette.glow!;
  return palette;
}

const LAYOUT_RULES: Record<CustomLayoutId, string> = {
  smart:
    "Smart layout: decide per Scene between useful full screen, top/bottom split, left/right split and presenter corner. Introduce a divided or picture-in-picture relationship only when simultaneous evidence or speaker continuity makes it meaningfully better.",
  "split-top-bottom":
    "Top/bottom split: divide the canvas into horizontal planes. Choose which plane holds the source from subject crop, reading order and evidence; keep one plane visually dominant and protect the caption safe area.",
  "split-left-right":
    "Left/right split: divide the canvas into vertical planes. Choose which plane holds the source from subject crop, reading order and evidence; preserve a readable source crop and one clear hierarchy.",
  "presenter-corner":
    "Presenter corner: authored content, evidence, screen recording or product media owns the full canvas; the presenter becomes a compact picture-in-picture window in a safe corner. Keep the presenter recognisable, subtly rounded and clear of captions or critical content.",
};

const CORNER_RULES: Record<PresenterCornerId, string> = {
  "top-left": "Place the presenter window in the top-left corner.",
  "top-right": "Place the presenter window in the top-right corner.",
  "bottom-left": "Place the presenter window in the bottom-left corner.",
  "bottom-right": "Place the presenter window in the bottom-right corner.",
};

const TOP_BOTTOM_RULES: Record<TopBottomPresenterId, string> = {
  top: "Place the presenter in the top plane and the authored content in the bottom plane.",
  bottom:
    "Place the authored content in the top plane and the presenter in the bottom plane.",
};

const LEFT_RIGHT_RULES: Record<LeftRightPresenterId, string> = {
  left: "Place the presenter in the left plane and the authored content in the right plane.",
  right:
    "Place the authored content in the left plane and the presenter in the right plane.",
};

function includes<T extends string>(
  items: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (items as readonly string[]).includes(value)
  );
}

/** Strictly normalize an untrusted client/project value. Unknown fields and ids are discarded. */
export function normalizeCustomVisualStyle(
  value: unknown,
): CustomVisualStyle | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.version !== CUSTOM_VISUAL_STYLE_VERSION) return null;
  if (!includes(CUSTOM_VISUAL_STYLE_IDS.palette, row.palette)) return null;
  if (!includes(CUSTOM_VISUAL_STYLE_IDS.captionPreset, row.captionPreset))
    return null;
  if (!includes(CUSTOM_VISUAL_STYLE_IDS.layout, row.layout)) return null;
  if (
    !includes(
      CUSTOM_VISUAL_STYLE_IDS.topBottomPresenter,
      row.topBottomPresenter,
    )
  )
    return null;
  if (
    !includes(
      CUSTOM_VISUAL_STYLE_IDS.leftRightPresenter,
      row.leftRightPresenter,
    )
  )
    return null;
  if (!includes(CUSTOM_VISUAL_STYLE_IDS.presenterCorner, row.presenterCorner))
    return null;
  return {
    version: CUSTOM_VISUAL_STYLE_VERSION,
    palette: row.palette,
    captionPreset: row.captionPreset,
    layout: row.layout,
    topBottomPresenter: row.topBottomPresenter,
    leftRightPresenter: row.leftRightPresenter,
    presenterCorner: row.presenterCorner,
  };
}

export function customVisualStylePalette(
  style: CustomVisualStyle,
  directionPalette?: Record<string, string> | null,
): Record<string, string> {
  return resolveVisualDirectionPalette(directionPalette, style);
}

/** Compile the user's independent choices into the same rich contract consumed by official Frames. */
export function customVisualStylePlaybook(style: CustomVisualStyle): string {
  const palette = CUSTOM_STYLE_PALETTES[style.palette];
  const caption = getCaptionPreset(style.captionPreset);
  return `# User visual controls

The user explicitly combined these dimensions with the selected visual direction. Treat every choice as intentional. This playbook is subordinate to user authority. Resolve conflicts in this order: (1) the user's latest explicit instruction; (2) the current project controls and manual UI state in the latest composition snapshot, including captions, layout, palette, canvas and element placement; (3) these saved custom-style selections where no newer project value exists; (4) the visual direction's defaults. Never reset or restyle a current manual setting merely to make the visual direction more recognizable.

Caption and layout choices override the direction's defaults. The color choice steers the direction's authored color system; it does not flatten that system into one generic palette. Preserve the direction's structural signatures only in the remaining degrees of freedom: shape language, material treatment, image treatment, typography personality, color-role relationships and motion grammar. These controls affect visual expression only; the active Skill and Director still decide story, evidence, timing, B-roll need and factual truth.

## Color direction

- user color anchor: ${palette.accent}
- supporting anchor: ${palette["accent-2"]}

Use the resolved active-theme token table supplied with the project for actual colors. Preserve the visual direction's authored number of color roles and their relative contrast, saturation and harmony. A multicolor direction such as Memphis must remain multicolor; an editorial direction may stay restrained. Use semantic roles consistently across footage, generated images, graphics and captions. Accent marks hierarchy or consequence; it is not decoration to distribute evenly.

## Generated and sourced imagery

There is deliberately no fixed image medium in this custom style. Decide between existing footage, sourced evidence and generated imagery from the Scene's meaning, factual needs and continuity. When generation is useful, construct a concrete prompt from subject, action, environment, composition, camera/light, material and the selected palette/layout identity. Keep generated assets coherent across the project, but do not force every idea into photography, collage, illustration or 3D. Existing truthful footage and supplied product evidence remain authoritative.

## Captions and typography

Unless the latest user instruction or current project state contains a newer manual caption choice, use the product caption preset \`${caption.id}\` exactly as selected: mode \`${caption.mode}\`, text color \`${caption.text}\`${caption.emphasis ? `, emphasis color \`${caption.emphasis}\`` : ""}${caption.bg ? `, backing \`${caption.bg}\`` : ", no fixed backing"}${caption.deco ? `, \`${caption.deco}\` emphasis decoration` : ""}${caption.font ? `, \`${caption.font}\` type family` : ""}${caption.italic ? ", italic treatment" : ""}.

Captions follow spoken meaning and safe areas. Keep line breaks intentional, contrast accessible, and timing readable. A caption treatment does not authorize duplicating the whole narration as decorative text.

## Composition and layout

${LAYOUT_RULES[style.layout]}
${style.layout === "split-top-bottom" ? `\n${TOP_BOTTOM_RULES[style.topBottomPresenter]}` : ""}
${style.layout === "split-left-right" ? `\n${LEFT_RIGHT_RULES[style.leftRightPresenter]}` : ""}
${style.layout === "presenter-corner" ? `\n${CORNER_RULES[style.presenterCorner]}` : ""}

These are composition strategies, not arbitrary card layouts. Execute split choices with Studio's matching framing primitives. Execute presenter corner with the selected corner source treatment while keeping the authored content plane full screen behind it. Smart layout lets the Director choose the strategy and exact side from visual analysis; explicit split/corner choices must be respected. If the latest project snapshot shows that the user manually changed the layout after this style was saved, preserve that current layout instead. Do not use an opaque full-canvas block over useful footage unless the selected strategy and the Scene's narrative job both justify it.

## Cross-layer consistency

- Motion Graphics, generated images, captions and transitions must look authored for the same video.
- Reuse color roles, edge treatment, type hierarchy and spatial rhythm. Do not redesign each Scene independently.
- The LLM chooses semantic content and an appropriate treatment; renderer-safe primitives and the selected rules own visual consistency.
- Prefer one strong visual proposition over several generic cards, stickers or labels.
- Preserve factual evidence, brand identity, faces and product geometry.
- Review the sequence, not just isolated frames: alternate pressure and breathing room without leaving this visual language.`;
}

export interface VisualDirectionContent {
  title: string;
  body: string;
}

/** Combine one structural art direction with the user's independent visual controls. The Frame remains
 * the visual grammar; color, captions and layout are explicit overrides rather than a competing theme. */
export function composeVisualDirectionContent(
  direction: VisualDirectionContent | null,
  style: CustomVisualStyle | null,
): VisualDirectionContent | null {
  if (!style) return direction;
  const controls = customVisualStylePlaybook(style);
  if (!direction) return { title: "User visual controls", body: controls };
  return { title: direction.title, body: `${direction.body}\n\n${controls}` };
}
