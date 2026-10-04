import type { BrandObservationSummary } from './brand-analysis';
import type { BrandEditSpec } from './brand-edit-spec';
import { METHOD_VERSION } from './brand-method';
import { PLAYBOOK_SCHEMA, type BrandAsset, type BrandPlatform, type BrandPlaybook, type Confidence, type Evidence, type FixedHabits, type Frequency, type Move, type TextBand } from './brand-playbook';
import type { Synthesis, VideoReading } from './brand-reading';
import { BASE_CAPTION_FONT_PX } from './caption-presets';

/**
 * A's last step: the playbook from what was measured (fixed habits, pace) and what the synthesis
 * judged (portrait, moves, structure, generation prompts). Measurement owns every value it can
 * measure; the synthesis owns the judged parts. Pure: assets are already uploaded.
 */
export interface PlaybookParts {
  id: string; name: string; platform: BrandPlatform; account?: string;
  videos: BrandPlaybook['source']['videos'];
  spec: BrandEditSpec;
  summary: BrandObservationSummary;
  readings: VideoReading[];
  synthesis: Synthesis;
  /** Canvas height per unit of width of the creator's videos (16/9 for vertical). */
  heightPerWidth: number;
  assets: {
    logo?: BrandAsset; intro?: BrandAsset; outro?: BrandAsset;
    bands?: { header?: TextBand; hookLabel?: TextBand & { durationSec: number } };
    frame?: { window: { x: number; y: number; w: number; h: number }; fill: string };
    coverReferences: BrandAsset[];
    /** Stills saved for cited moments, by video and second. */
    stills: { video: string; sec: number; key: string }[];
    /** Measured caption colours (text, plate) from the caption band. */
    captionColors?: { color: string; plate: string | null };
  };
}

/** The cap a frequency level allows when the planner draws on a move. */
export const FREQUENCY_CAP: Record<Frequency, number> = { rare: 1, moderate: 2, frequent: 6 };

const majority = <T>(values: (T | null | undefined)[]): T | undefined => {
  const counts = new Map<T, number>();
  for (const value of values) if (value != null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

export function assemblePlaybook(parts: PlaybookParts): BrandPlaybook {
  const { spec, summary, readings, synthesis, assets } = parts;
  const total = parts.videos.length;
  const confidenceOf = (videos: number): Confidence => videos / total >= 0.7 ? 'high' : videos / total >= 0.4 ? 'medium' : 'low';
  const evidence = (videos: string[], seconds: { video: string; sec: number }[] = []): Evidence => ({
    videos, confidence: confidenceOf(videos.length),
    ...(seconds.length ? { frames: seconds.map(ref => ({ ...ref, ...(assets.stills.find(still => still.video === ref.video && Math.abs(still.sec - ref.sec) < 0.05) ? { key: assets.stills.find(still => still.video === ref.video && Math.abs(still.sec - ref.sec) < 0.05)!.key } : {}) })) } : {}),
  });
  const facet = <K extends keyof VideoReading['facets']>(key: K) => majority(readings.map(reading => reading.facets[key] as VideoReading['facets'][K] | null));

  const fixed: FixedHabits = {};
  const captionsOn = spec.captions.presence.value !== 'never';
  if (summary.captions || !captionsOn) {
    const geometry = summary.captions;
    const treatment = facet('captionTreatment');
    const outline = majority(readings.map(reading => reading.look.captionOutline));
    const fill = assets.captionColors?.color ?? majority(readings.map(reading => reading.look.captionFill));
    const accent = facet('accentRule');
    fixed.captions = {
      on: captionsOn,
      ...(geometry && captionsOn ? {
        style: {
          preset: 'ln-clean', font: 'sans', bold: facet('fontClass') !== 'platform_native',
          ...(fill ? { color: fill } : {}),
          ...(treatment === 'stroke' ? { strokeColor: outline ?? '#000000', strokeWidth: 3 } : {}),
          ...(treatment === 'box' && assets.captionColors?.plate ? { bg: assets.captionColors.plate } : {}),
          scale: Math.round(geometry.lineHeightPct / 100 * 1080 * parts.heightPerWidth / 1.2 / BASE_CAPTION_FONT_PX * 100) / 100,
          xPct: geometry.xCenterPct, yPct: geometry.bottomPct, wPct: Math.min(94, Math.max(40, Math.round(geometry.widthPct * 1.15))),
        },
        perScreen: spec.captions.wordsPerPage.value,
        upper: spec.captions.case.value === 'upper',
        accent: accent === 'keywords' ? 'keywords' : accent === 'numbers_money' ? 'numbers' : accent === 'current_word' ? 'current_word' : null,
      } : {}),
      ...(geometry ? { evidence: { videos: geometry.evidence.videos, confidence: geometry.evidence.confidence } } : {}),
    };
  }
  if (assets.bands && (assets.bands.header || assets.bands.hookLabel)) fixed.bands = assets.bands;
  if (assets.frame) fixed.frame = assets.frame;
  if (assets.logo && summary.logo) fixed.logo = { ...assets.logo, corner: summary.logo.corner, widthPct: Math.min(40, Math.max(4, Math.round(summary.logo.box.w * 100))), opacity: 1, evidence: { videos: summary.logo.evidence.videos, confidence: summary.logo.evidence.confidence } };
  if (assets.intro && summary.intro) fixed.intro = { ...assets.intro, evidence: { videos: summary.intro.evidence.videos, confidence: summary.intro.evidence.confidence } };
  if (assets.outro && summary.outro) fixed.outro = { ...assets.outro, evidence: { videos: summary.outro.evidence.videos, confidence: summary.outro.evidence.confidence } };
  if (Object.keys(synthesis.palette).length) fixed.palette = synthesis.palette;
  if (spec.audio.targetLufs.provenance.source === 'measured') fixed.loudness = { lufs: Math.round(spec.audio.targetLufs.value * 2) / 2, evidence: { videos: spec.usedVideos, confidence: spec.audio.targetLufs.provenance.confidence >= 0.7 ? 'high' : spec.audio.targetLufs.provenance.confidence >= 0.4 ? 'medium' : 'low' } };
  if (spec.cutting.silence.provenance.source === 'measured') fixed.pauses = { mode: ({ aggressive: 'tight', moderate: 'moderate', natural: 'natural' } as const)[spec.cutting.silence.value.mode], evidence: { videos: spec.usedVideos, confidence: spec.cutting.silence.provenance.confidence >= 0.7 ? 'high' : spec.cutting.silence.provenance.confidence >= 0.4 ? 'medium' : 'low' } };

  const moves: Move[] = synthesis.moves.map(move => ({
    kind: move.kind, variants: move.variants, frequency: move.frequency, maxPerMin: FREQUENCY_CAP[move.frequency], trigger: move.trigger,
    // How tight a punch-in goes is a fingerprint (the number of framing sizes): two sizes stay gentle, three or more go close.
    ...(move.kind === 'punch_in' ? { settings: { scale: facet('punchIn') === 'three_plus' ? 1.35 : 1.2 } } : {}),
    evidence: evidence(move.videos, move.evidence),
  }));

  const said = (rule: { text: string; en: string; videos: string[] } | null) => rule ? { text: rule.text, en: rule.en, evidence: evidence(rule.videos) } : undefined;
  const opening = said(synthesis.opening); const closing = said(synthesis.closing);
  const headerExamples = spec.textOverlays.header.value.examples;
  return {
    schema: PLAYBOOK_SCHEMA, id: parts.id, name: parts.name, version: 1, method: METHOD_VERSION,
    source: { platform: parts.platform, ...(parts.account ? { account: parts.account } : {}), videos: parts.videos },
    portrait: synthesis.portrait,
    fixed, moves,
    structure: {
      ...(opening ? { opening } : {}), ...(closing ? { closing } : {}),
      pace: { cutsPerMin: [Math.round(spec.cutting.targetCpm.value[0]), Math.round(spec.cutting.targetCpm.value[1])], evidence: { videos: spec.usedVideos, confidence: spec.cutting.targetCpm.provenance.confidence >= 0.7 ? 'high' : spec.cutting.targetCpm.provenance.confidence >= 0.4 ? 'medium' : 'low' } },
      rules: synthesis.structure.map(rule => said(rule)!),
    },
    generation: {
      ...(synthesis.cover ? { cover: { layout: synthesis.cover.layout, lettering: synthesis.cover.lettering, references: assets.coverReferences } } : {}),
      ...(synthesis.headlines ? { headlines: { manner: synthesis.headlines, examples: headerExamples } } : {}),
      ...(synthesis.elements.length ? { elements: synthesis.elements.map(rule => said(rule)!) } : {}),
    },
  };
}
