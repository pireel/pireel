/**
 * Export option recommendations — resolution / fps / format tuned to the source footage and the
 * target distribution platform. The export tool returns these when the user hasn't chosen yet, so
 * the agent can ask (in chat, or in the external MCP client) instead of silently defaulting.
 *
 * Pure + deterministic (no DOM, no clock): the canvas dimensions ARE the source's native pixels
 * (the canvas follows the footage at import), so min(width,height) is the native short side that
 * caps every recommendation — we never suggest upscaling the footage past what it actually is.
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
 * Build export recommendations for a composition. Vertical platforms (小红书 / 抖音 / TikTok) recommend
 * 1080p vertical; YouTube scales with the footage (landscape up to 2160). Every option is capped to
 * the native short side. Notes flag orientation mismatch (a landscape cut on a vertical-first feed).
 */
export function exportRecommendations(comp: Composition): ExportRecommendations {
  const width = comp.width || 1080;
  const height = comp.height || 1920;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const orientation = width === height ? 'square' : width < height ? 'portrait' : 'landscape';
  const nativeTier = tierAtOrBelow(shortSide);
  const cap = (v: number): Tier => tierAtOrBelow(Math.min(v, shortSide));
  const vertical = orientation !== 'landscape';
  // Vertical-first feeds: a landscape cut still exports, but it letterboxes / gets less reach there.
  const orient = (native: boolean) =>
    native
      ? vertical
        ? '竖屏适配，正好'
        : '横屏适配，正好'
      : vertical
        ? ''
        : '注意：该平台以竖屏为主，横屏视频曝光可能受限';

  const options: ExportOption[] = [
    {
      id: 'source',
      platform: '原画质',
      resolution: nativeTier,
      fps: 30,
      format: 'mp4',
      note: `贴合原视频 ${width}×${height}，不放大不损失`,
    },
    {
      id: 'xiaohongshu',
      platform: '小红书',
      resolution: cap(1080),
      fps: 30,
      format: 'mp4',
      note: ['竖屏信息流，1080p 足够、文件小加载快', orient(vertical)].filter(Boolean).join('；'),
    },
    {
      id: 'douyin_tiktok',
      platform: '抖音 / TikTok',
      resolution: cap(1080),
      fps: 30,
      format: 'mp4',
      note: ['竖屏 9:16 标准；画面运动快可选 60fps', orient(vertical)].filter(Boolean).join('；'),
    },
    {
      id: 'youtube',
      platform: 'YouTube',
      resolution: vertical ? cap(1080) : cap(2160),
      fps: 30,
      format: 'mp4',
      note: vertical
        ? 'Shorts 竖屏 1080p；横屏长视频可上 1080p/4K、支持 60fps'
        : `横屏首选，${cap(2160) >= 1440 ? '可上 1440p/4K' : '1080p'}、支持 60fps`,
    },
  ];

  return {
    canvas: { width, height, orientation },
    source: { shortSide, longSide },
    options,
    defaultId: 'source',
  };
}
