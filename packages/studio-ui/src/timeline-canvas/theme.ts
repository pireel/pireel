/**
 * The canvas timeline's colours, read from the same utility classes the DOM timeline wears, so the
 * two match in every theme without a second palette: each class is put on a hidden probe and the
 * browser's own computed colour is what the canvas paints with.
 */
import type { BlockKind } from '@pireel/studio-engine/composition';

const BACKGROUNDS = {
  panel: 'bg-panel',
  panelSoft: 'bg-panel/70',
  panelFaint: 'bg-panel/45',
  lineStrong: 'bg-line/80',
  accentStrong: 'bg-accent/80',
  panelStrong: 'bg-panel/85',
  canvas: 'bg-canvas',
  accentHover: 'bg-accent/90',
  accentDashed: 'bg-accent/50',
  row: 'bg-panel-2/40',
  missing: 'bg-panel-2',
  line: 'bg-line',
  lineSoft: 'bg-line/60',
  clip: 'bg-ink/10',
  frame: 'bg-white/10',
  frameHover: 'bg-accent/40',
  badge: 'bg-black/55',
  badgeStrong: 'bg-black/70',
  accent: 'bg-accent',
  accentSoft: 'bg-accent/70',
  accentBody: 'bg-accent/8',
  accentWash: 'bg-accent/20',
  accentLabel: 'bg-accent/10',
  accentLabelSelected: 'bg-accent/18',
  playhead: 'bg-rose',
  hover: 'bg-yellow-400/90',
  marquee: 'bg-sky-400/15',
  marqueeLine: 'bg-sky-400',
  insertLine: 'bg-amber-400',
  caption: 'bg-rose-500/12',
  captionHover: 'bg-rose-500/20',
  captionLine: 'bg-rose-400/25',
  captionSelected: 'bg-rose-600 dark:bg-rose-400',
  handleHover: 'bg-ink/35',
  pendingLine: 'bg-white/40',
} as const;
const TEXTS = {
  ink: 'text-ink',
  ink2: 'text-ink-2',
  ink3: 'text-ink-3',
  ink4: 'text-ink-4',
  accentInk: 'text-accent-ink',
  wave: 'text-accent-ink/60',
  waveMuted: 'text-accent-ink/25',
  waveOff: 'text-ink-4/40',
  audioLine: 'text-accent-ink/40',
  audioBody: 'text-accent-ink/10',
  audioBodySelected: 'text-accent-ink/18',
  onAccent: 'text-accent-foreground',
  white: 'text-white',
} as const;
/** Per block kind: resting fill, selected fill, resting frame, selected frame (and handle), icon. */
const KINDS: Record<BlockKind, [string, string, string, string, string]> = {
  caption: ['bg-rose-500/15', 'bg-rose-500/30', 'bg-rose-400/30', 'bg-rose-600 dark:bg-rose-400', 'text-rose-500'],
  title: ['bg-amber-500/15', 'bg-amber-500/30', 'bg-amber-400/30', 'bg-amber-600 dark:bg-amber-400', 'text-amber-600'],
  stat: ['bg-emerald-500/15', 'bg-emerald-500/30', 'bg-emerald-400/30', 'bg-emerald-600 dark:bg-emerald-400', 'text-emerald-600'],
  list: ['bg-sky-500/15', 'bg-sky-500/30', 'bg-sky-400/30', 'bg-sky-600 dark:bg-sky-400', 'text-sky-600'],
  transition: ['bg-violet-500/15', 'bg-violet-500/30', 'bg-violet-400/30', 'bg-violet-600 dark:bg-violet-400', 'text-violet-500'],
  media: ['bg-teal-500/15', 'bg-teal-500/30', 'bg-teal-400/30', 'bg-teal-600 dark:bg-teal-400', 'text-teal-600'],
  custom: ['bg-slate-400/15', 'bg-slate-400/30', 'bg-slate-300/30', 'bg-slate-600 dark:bg-slate-400', 'text-ink-3'],
};

export interface KindColors { fill: string; fillSelected: string; line: string; lineSelected: string; icon: string }
export type TimelineColors = { [K in keyof typeof BACKGROUNDS]: string } & { [K in keyof typeof TEXTS]: string } & {
  kinds: Record<BlockKind, KindColors>;
  /** The page's text face, for labels. */
  font: string;
  monoFont: string;
};

/** Reads every colour once; call again when the theme changes. */
export function readTimelineColors(host: HTMLElement): TimelineColors {
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  host.appendChild(box);
  const read = (className: string, property: 'backgroundColor' | 'color') => {
    const probe = box.appendChild(document.createElement('span'));
    probe.className = className;
    return getComputedStyle(probe)[property];
  };
  const colors = { kinds: {} } as TimelineColors;
  for (const [name, className] of Object.entries(BACKGROUNDS)) (colors as unknown as Record<string, string>)[name] = read(className, 'backgroundColor');
  for (const [name, className] of Object.entries(TEXTS)) (colors as unknown as Record<string, string>)[name] = read(className, 'color');
  for (const [kind, [fill, fillSelected, line, lineSelected, icon]] of Object.entries(KINDS) as [BlockKind, (typeof KINDS)[BlockKind]][]) {
    colors.kinds[kind] = { fill: read(fill, 'backgroundColor'), fillSelected: read(fillSelected, 'backgroundColor'), line: read(line, 'backgroundColor'), lineSelected: read(lineSelected, 'backgroundColor'), icon: read(icon, 'color') };
  }
  colors.font = getComputedStyle(host).fontFamily;
  const mono = box.appendChild(document.createElement('span'));
  mono.className = 'font-mono';
  colors.monoFont = getComputedStyle(mono).fontFamily;
  box.remove();
  return colors;
}
