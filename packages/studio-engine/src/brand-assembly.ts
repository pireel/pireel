import type { BrandObservationSummary } from './brand-analysis';
import type { BrandEditSpec } from './brand-edit-spec';
import { METHOD_VERSION } from './brand-method';
import { PLAYBOOK_SCHEMA, type BrandAsset, type BrandBlocks, type BrandPlatform, type BrandPlaybook, type Confidence, type Evidence } from './brand-playbook';
import type { FontReading, FontRole } from './brand-fonts';
import type { Synthesis, VideoReading } from './brand-reading';
import { BASE_CAPTION_FONT_PX } from './caption-presets';

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
  cover?: { source?: 'video' | 'photo'; frame: string; headline?: string; design: string; held: number; total: number; videos: string[] };
  /** The typefaces read from crops of the creator's text, by role. */
  fonts?: Partial<Record<FontRole, FontReading>>;
  /** Canvas height per unit of width of the creator's videos (16/9 for vertical). */
  heightPerWidth: number;
  assets: {
    logo?: BrandAsset; intro?: BrandAsset; outro?: BrandAsset;
    /** Covers (those the cover prompt holds for first), stills of titles on screen, stills of motion
     *  graphics — references for those blocks. */
    coverReferences: BrandAsset[]; layoutReferences: BrandAsset[]; motionReferences: BrandAsset[];
    /** Measured caption colours (text, plate) from the caption band. */
    captionColors?: { color: string; plate: string | null };
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
const LINE_BELOW_GLYPHS = 0.175;

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
  const say = (zh: string, en: string) => parts.locale === 'zh' ? zh : en;
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
    const perScreen = spec.captions.wordsPerPage.value; const upper = spec.captions.case.value === 'upper';
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
          scale: Math.round(geometry.lineHeightPct / 100 * 1080 * parts.heightPerWidth / CAPTION_BOX_PER_FONT / BASE_CAPTION_FONT_PX * 100) / 100,
          // The engine anchors the line box (1.35× the font) by its bottom; the OCR box hugs the glyphs.
          xPct: geometry.xCenterPct, yPct: Math.round((geometry.bottomPct + LINE_BELOW_GLYPHS * geometry.lineHeightPct / CAPTION_BOX_PER_FONT) * 10) / 10, wPct: Math.min(94, Math.max(40, Math.round(geometry.widthPct * 1.15))),
        },
        accent: accent === 'keywords' ? 'keywords' : accent === 'numbers_money' ? 'numbers' : accent === 'current_word' ? 'current_word' : null,
        text: say(`每屏约 ${perScreen} 个字词${upper ? '，全大写' : ''}。`, `About ${perScreen} words on screen at once${upper ? ', all caps' : ''}.`),
      } : {}),
      ...(geometry ? { evidence: { videos: geometry.evidence.videos, confidence: geometry.evidence.confidence } } : {}),
    };
  }
  if (assets.logo && summary.logo) blocks.logo = { ...assets.logo, corner: summary.logo.corner, widthPct: Math.min(40, Math.max(4, Math.round(summary.logo.box.w * 100))), opacity: 1, evidence: { videos: summary.logo.evidence.videos, confidence: summary.logo.evidence.confidence } };
  if (Object.keys(synthesis.palette).length) blocks.palette = synthesis.palette;
  // Titles and generated elements take the creator's title face (else their cover lettering), body text
  // their caption face; the prose keeps what each face looks like and is taken to be.
  const fonts = parts.fonts ?? {};
  const heading = fonts.titles ?? fonts.cover; const body = fonts.captions;
  if (heading || body) {
    const names: Record<FontRole, string> = { captions: say('字幕', 'Captions'), titles: say('标题', 'Titles'), cover: say('封面', 'Cover') };
    const lines = (['captions', 'titles', 'cover'] as const).flatMap(role => { const font = fonts[role]; return font ? [`${names[role]}${say('：', ': ')}${font.look}${font.actual ? say(`（像 ${font.actual}）`, ` (like ${font.actual})`) : ''}`] : []; });
    blocks.fonts = { ...(heading ? { heading: heading.id } : {}), ...(body ? { body: body.id } : {}), text: lines.join('\n') };
  }

  const loudness = spec.audio.targetLufs.provenance.source === 'measured' ? Math.round(spec.audio.targetLufs.value * 2) / 2 : undefined;
  const pauses = spec.cutting.silence.provenance.source === 'measured' ? ({ aggressive: 'tight', moderate: 'moderate', natural: 'natural' } as const)[spec.cutting.silence.value.mode] : undefined;
  const soundProse = prose('sound');
  if (loudness !== undefined || pauses || soundProse) blocks.sound = { ...(loudness !== undefined ? { lufs: loudness } : {}), ...(pauses ? { pauses } : {}), ...(soundProse ?? { evidence: { videos: spec.usedVideos, confidence: fromField(spec.audio.targetLufs.provenance.confidence) } }) };

  if (assets.intro || assets.outro) blocks.bookends = { ...(assets.intro ? { intro: assets.intro } : {}), ...(assets.outro ? { outro: assets.outro } : {}), ...(summary.intro ?? summary.outro ? { evidence: { videos: (summary.intro ?? summary.outro)!.evidence.videos, confidence: (summary.intro ?? summary.outro)!.evidence.confidence } } : {}) };

  const layout = prose('layout'); if (layout || assets.layoutReferences.length) blocks.layout = { ...layout, ...(assets.layoutReferences.length ? { references: assets.layoutReferences } : {}) };
  const editing = prose('editing'); if (editing) blocks.editing = editing;
  const motion = prose('motion_graphics'); if (motion) blocks.motion_graphics = { ...motion, ...(assets.motionReferences.length ? { references: assets.motionReferences } : {}) };
  const structure = prose('structure'); if (structure) blocks.structure = structure;
  const cover = parts.cover;
  if (cover || assets.coverReferences.length) blocks.cover = {
    ...(cover ? { ...(cover.source ? { source: cover.source } : {}), frame: cover.frame, ...(cover.headline ? { headline: cover.headline } : {}), design: cover.design, evidence: { videos: cover.videos, confidence: cover.total < 3 ? 'low' : cover.held / cover.total >= 0.7 ? 'high' : 'medium' } } : {}),
    ...(assets.coverReferences.length ? { references: assets.coverReferences } : {}),
  };

  return {
    schema: PLAYBOOK_SCHEMA, id: parts.id, name: parts.name, version: 1, method: METHOD_VERSION,
    source: { platform: parts.platform, ...(parts.account ? { account: parts.account } : {}), videos: parts.videos },
    blocks,
  };
}
