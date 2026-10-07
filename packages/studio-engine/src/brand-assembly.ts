import type { BrandObservationSummary } from './brand-analysis';
import type { BrandEditSpec } from './brand-edit-spec';
import { METHOD_VERSION } from './brand-method';
import { PLAYBOOK_SCHEMA, type BrandAsset, type BrandBlocks, type BrandPlatform, type BrandPlaybook, type Confidence, type Evidence } from './brand-playbook';
import type { FontReading, FontRole } from './brand-fonts';
import type { Synthesis, VideoReading } from './brand-reading';
import { BASE_CAPTION_FONT_PX } from './caption-presets';
import { BRAND_EDITING_SKILL_IDS } from './editing-skills';

/**
 * The method's last step: the brand from what was measured (the fixed blocks) and what the synthesis
 * wrote (the prose blocks). Measurement owns every value it can measure. Pure: assets are uploaded.
 */
export interface PlaybookParts {
  id: string; name: string; platform: BrandPlatform; account?: string; locale: 'zh' | 'en';
  videos: BrandPlaybook['source']['videos'];
  spec: BrandEditSpec;
  summary: BrandObservationSummary;
  readings: VideoReading[];
  synthesis: Synthesis;
  /** The cover prompt from the creator's covers: how many covers were read, how many it holds for, and
   *  the videos those covers belong to (hand-added covers belong to none). */
  cover?: { frame: string; design: string; held: number; total: number; videos: string[] };
  /** The typefaces read from crops of the creator's text, by role. */
  fonts?: Partial<Record<FontRole, FontReading>>;
  /** Canvas height per unit of width of the creator's videos (16/9 for vertical). */
  heightPerWidth: number;
  assets: {
    logo?: BrandAsset; intro?: BrandAsset; outro?: BrandAsset;
    /** Stills of titles on screen and of motion graphics — references for those blocks. */
    layoutReferences: BrandAsset[]; motionReferences: BrandAsset[];
    /** Stills of moments the creator left the speaker for B-roll. */
    brollReferences?: BrandAsset[];
    /** Measured caption colours (text, plate) from the caption band. */
    captionColors?: { color: string; plate: string | null };
    /** Where the caption letters really are, measured on pixels: their height and bottom, % of the frame. */
    captionInk?: { heightPct: number; bottomPct: number };
  };
}

const majority = <T>(values: (T | null | undefined)[]): T | undefined => {
  const counts = new Map<T, number>();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** OCR line-box height per font size of a burned-in caption. */
const CAPTION_BOX_PER_FONT = 0.95;
/** Space under the glyphs inside the engine's caption line box, per font size. */
const LINE_BELOW_GLYPHS = 0.2;
/** Height of CJK letters (ink) per font size in the caption faces. */
const INK_PER_FONT = 0.88;

/** Two colours close enough to be the same caption colour, measured two ways. */
const near = (a: string, b: string) => {
  const rgb = (value: string) => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!) < 100;
};

export function assemblePlaybook(parts: PlaybookParts): BrandPlaybook {
  const { spec, summary, readings, synthesis, assets } = parts;
  const total = parts.videos.length;
  const confidenceOf = (videos: number): Confidence => videos / total >= 0.7 ? 'high' : videos / total >= 0.4 ? 'medium' : 'low';
  const fromField = (confidence: number): Confidence => confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low';
  const evidence = (videos: string[]): Evidence => ({ videos, confidence: confidenceOf(videos.length) });
  const facet = <K extends keyof VideoReading['facets']>(key: K) => majority(readings.map(reading => reading.facets[key] as VideoReading['facets'][K] | null));
  const blocks: BrandBlocks = {};
  const prose = (id: keyof Synthesis['blocks']) => { const block = synthesis.blocks[id]; return block ? { text: block.text, ...(block.videos.length ? { evidence: evidence(block.videos) } : {}) } : undefined; };

  const portrait = prose('portrait'); if (portrait) blocks.portrait = portrait;

  const captionsOn = spec.captions.presence.value !== 'never';
  if (summary.captions || !captionsOn) {
    const geometry = summary.captions;
    const treatment = facet('captionTreatment');
    const outline = majority(readings.map(reading => reading.look.captionOutline));
    // The measured colour gives the exact value, but one frame's two-colour split can take the outline for
    // the text (white letters over a white shirt); when it disagrees with what the readings saw, they win.
    const readFill = majority(readings.map(reading => reading.look.captionFill));
    const measured = assets.captionColors && (!readFill || near(assets.captionColors.color, readFill)) ? assets.captionColors : undefined;
    const fill = measured?.color ?? readFill;
    const accent = facet('accentRule');
    // Font size and place from the letters measured on pixels; the OCR box (approximate) when there are none.
    const ink = assets.captionInk;
    const fontPct = ink ? ink.heightPct / INK_PER_FONT : (geometry?.lineHeightPct ?? 0) / CAPTION_BOX_PER_FONT;
    const glyphBottomPct = ink ? ink.bottomPct : geometry?.bottomPct ?? 0;
    blocks.captions = {
      on: captionsOn,
      ...(geometry && captionsOn ? {
        style: {
          preset: 'ln-clean', font: parts.fonts?.captions?.id ?? 'sans',
          bold: parts.fonts?.captions?.weight ? parts.fonts.captions.weight === 'bold' || parts.fonts.captions.weight === 'black' : facet('fontClass') !== 'platform_native',
          ...(fill ? { color: fill } : {}),
          ...(treatment === 'stroke' ? { strokeColor: outline ?? '#000000', strokeWidth: 3 } : {}),
          ...(treatment === 'box' && measured?.plate ? { bg: measured.plate } : {}),
          // An OCR line box is about as tall as the font size for CJK and Latin captions alike (checked by
          // overlaying the rendered sample on a creator's own captioned frame).
          scale: Math.round(fontPct / 100 * 1080 * parts.heightPerWidth / BASE_CAPTION_FONT_PX * 100) / 100,
          // The engine anchors the line box (1.35× the font) by its bottom, below the glyphs.
          xPct: geometry.xCenterPct, yPct: Math.round((glyphBottomPct + LINE_BELOW_GLYPHS * fontPct) * 10) / 10, wPct: Math.min(94, Math.max(40, Math.round(geometry.widthPct * 1.15))),
        },
        // Highlighting is on or off: the platform picks the words (and breaks the lines) itself.
        accent: accent && accent !== 'none' ? 'keywords' : null,
      } : {}),
      ...(geometry ? { evidence: { videos: geometry.evidence.videos, confidence: geometry.evidence.confidence } } : {}),
    };
  }
  if (assets.logo && summary.logo) blocks.logo = { ...assets.logo, corner: summary.logo.corner, widthPct: Math.min(40, Math.max(4, Math.round(summary.logo.box.w * 100))), opacity: 1, evidence: { videos: summary.logo.evidence.videos, confidence: summary.logo.evidence.confidence } };
  // Overlay text (花字): the synthesis writes how it looks and moves; its font is the face of the words the
  // creator puts straight on the picture, else their cover lettering. Words in charts and cards are the
  // graphics', whose type the graphics prose describes.
  const fonts = parts.fonts ?? {};
  // A Chinese creator's overlay text needs a face with Han glyphs: a Latin-only face is taken only when no
  // role gave a Chinese one.
  const order = [fonts.titles, fonts.cover].filter((font): font is FontReading => !!font);
  const face = parts.locale === 'zh' ? order.find(font => !font.id.startsWith('google:')) ?? order[0] : order[0];
  const overlay = prose('overlay_text');
  if (overlay || face || assets.layoutReferences.length) blocks.overlay_text = {
    ...overlay,
    ...(face ? { font: face.id, ...(face.actual ? { fontLike: face.actual } : {}) } : {}),
    ...(assets.layoutReferences.length ? { references: assets.layoutReferences } : {}),
  };

  const loudness = spec.audio.targetLufs.provenance.source === 'measured' ? Math.round(spec.audio.targetLufs.value * 2) / 2 : undefined;
  const pauses = spec.cutting.silence.provenance.source === 'measured' ? ({ aggressive: 'tight', moderate: 'moderate', natural: 'natural' } as const)[spec.cutting.silence.value.mode] : undefined;
  // Sound effects are a switch the creator sets (the frames cannot hear them); background music is not part of a brand yet.
  if (loudness !== undefined || pauses) blocks.sound = { ...(loudness !== undefined ? { lufs: loudness } : {}), ...(pauses ? { pauses } : {}), evidence: { videos: spec.usedVideos, confidence: fromField(spec.audio.targetLufs.provenance.confidence) } };

  if (assets.intro || assets.outro) blocks.bookends = { ...(assets.intro ? { intro: assets.intro } : {}), ...(assets.outro ? { outro: assets.outro } : {}), ...(summary.intro ?? summary.outro ? { evidence: { videos: (summary.intro ?? summary.outro)!.evidence.videos, confidence: (summary.intro ?? summary.outro)!.evidence.confidence } } : {}) };

  // The picture: its principle in prose, with stills of the creator's B-roll moments.
  const visual = prose('visual');
  if (visual) blocks.visual = { ...visual, ...(assets.brollReferences?.length ? { references: assets.brollReferences } : {}) };
  // Motion graphics: their style in prose (colour and type chosen per video), with stills of them.
  const motion = prose('graphics');
  if (motion) blocks.graphics = { ...motion, ...(assets.motionReferences.length ? { references: assets.motionReferences } : {}) };
  const structure = prose('structure'); if (structure) blocks.structure = structure;
  const cover = parts.cover;
  if (cover) blocks.cover = {
    frame: cover.frame, design: cover.design, evidence: { videos: cover.videos, confidence: cover.total < 3 ? 'low' : cover.held / cover.total >= 0.7 ? 'high' : 'medium' },
  };

  return {
    schema: PLAYBOOK_SCHEMA, id: parts.id, name: parts.name, version: 1, method: METHOD_VERSION,
    source: { platform: parts.platform, ...(parts.account ? { account: parts.account } : {}), videos: parts.videos },
    blocks,
    skills: brandDefaultSkills(blocks, parts.readings),
  };
}

/**
 * The editing skills a brand turns on, from what the analysis found: captions when the videos carry
 * them, motion graphics when the creator makes them, B-roll when at least a third of the moments read
 * leave the speaker for it, the rough cut unless pauses are left natural. Sound effects stay off:
 * frames cannot hear them, so the creator turns them on.
 */
export function brandDefaultSkills(blocks: BrandBlocks, readings: VideoReading[]): string[] {
  const moments = readings.flatMap(reading => reading.moments);
  const broll = moments.filter(moment => moment.seen.includes('broll')).length;
  const on = new Set<string>();
  if (blocks.captions && blocks.captions.on !== false) on.add('captions');
  if (blocks.graphics?.text?.trim()) on.add('graphics');
  if (moments.length && broll * 3 >= moments.length) on.add('b-roll');
  if (blocks.sound?.pauses && blocks.sound.pauses !== 'natural') on.add('rough-cut');
  return BRAND_EDITING_SKILL_IDS.filter(id => on.has(id));
}
