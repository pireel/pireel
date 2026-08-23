/**
 * Export option recommendations — resolution / fps / format tuned to the source footage and the
 * target distribution platform. The export tool uses the source-quality option automatically;
 * platform alternatives remain available to explicit manual/export-spec overrides.
 *
 * Pure + deterministic (no DOM, no clock): the editable canvas controls output aspect while
 * video.sourceWidth/sourceHeight, when available, cap recommendations to source resolution.
 * Native fps isn't stored, so fps is a per-platform standard (30) with a 60 note where motion warrants.
 */

import type { Composition } from './composition';

/** Standard export short-side tiers (matches the export tool's resolution enum). */
const TIERS = [2160, 1440, 1080, 720, 540] as const;
type Tier = (typeof TIERS)[number];

/** Largest standard tier at or below v (so a recommendation never upscales past native). */
function tierAtOrBelow(v: number): Tier {
  return TIERS.find((t) => t <= v) ?? 540;
}

export interface ExportOption {
  /** Platform / intent key. */
  id: 'source' | 'xiaohongshu' | 'douyin_tiktok' | 'youtube';
  /** Short human label (localized upstream by the caller if needed; kept plain here). */
  platform: string;
  resolution: Tier;
  fps: 24 | 30 | 60;
  format: 'mp4';
  /** One-line rationale for the user. */
  note: string;
}

export interface ExportRecommendations {
  canvas: { width: number; height: number; orientation: 'portrait' | 'landscape' | 'square' };
  source: { shortSide: number; longSide: number };
  options: ExportOption[];
  /** Default the agent should offer if the user just wants "the standard one". */
  defaultId: ExportOption['id'];
}

/**
 * Build export recommendations for a composition. Vertical platforms (Xiaohongshu / Douyin / TikTok) recommend
 * 1080p vertical; YouTube scales with the footage (landscape up to 2160). Every option is capped to
 * the native short side. Notes flag orientation mismatch (a landscape cut on a vertical-first feed).
 */
export function exportRecommendations(comp: Composition): ExportRecommendations {
  const width = comp.width || 1080;
  const height = comp.height || 1920;
  const sourceWidth = comp.video?.sourceWidth ?? width;
  const sourceHeight = comp.video?.sourceHeight ?? height;
  const shortSide = Math.min(sourceWidth, sourceHeight);
  const longSide = Math.max(sourceWidth, sourceHeight);
  const orientation = width === height ? 'square' : width < height ? 'portrait' : 'landscape';
  const nativeTier = tierAtOrBelow(shortSide);
  const cap = (v: number): Tier => tierAtOrBelow(Math.min(v, shortSide));
  const vertical = orientation !== 'landscape';
  // Vertical-first feeds: a landscape cut still exports, but it letterboxes / gets less reach there.
  // Notes are English tool-data the agent relays — it re-expresses them in the user's language.
  const mismatch = !vertical ? ' — heads up: this feed is vertical-first, a landscape cut may get less reach' : '';

  const options: ExportOption[] = [
    {
      id: 'source',
      platform: 'Source quality',
      resolution: nativeTier,
      fps: 30,
      format: 'mp4',
      note: `keeps the ${width}×${height} canvas aspect and stays within the ${sourceWidth}×${sourceHeight} source resolution`,
    },
    {
      id: 'xiaohongshu',
      platform: 'Xiaohongshu',
      resolution: cap(1080),
      fps: 30,
      format: 'mp4',
      note: `vertical feed, 1080p is plenty and keeps the file small${mismatch}`,
    },
    {
      id: 'douyin_tiktok',
      platform: 'Douyin / TikTok',
      resolution: cap(1080),
      fps: 30,
      format: 'mp4',
      note: `standard 9:16 vertical; pick 60fps for fast motion${mismatch}`,
    },
    {
      id: 'youtube',
      platform: 'YouTube',
      resolution: vertical ? cap(1080) : cap(2160),
      fps: 30,
      format: 'mp4',
      note: vertical
        ? 'Shorts at 1080p vertical; a landscape long-form cut can go 1080p/4K and supports 60fps'
        : `landscape-first, ${cap(2160) >= 1440 ? 'up to 1440p/4K' : '1080p'}, supports 60fps`,
    },
  ];

  return {
    canvas: { width, height, orientation },
    source: { shortSide, longSide },
    options,
    defaultId: 'source',
  };
}
