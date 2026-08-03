/** Shared wire types returned by /api/studio/official-assets. */

export interface OfficialCategory {
  id: string;
  label: string;
  labelEn: string;
  count: number;
}

export interface OfficialSticker {
  id: string;
  /** Bare storage key — display always goes through imageThumb. */
  key: string;
  label?: string;
  category: string;
  categoryLabel: string;
  categoryLabelEn: string;
  source: string;
  license: string;
  format: 'png' | 'svg';
  tags?: string[];
  width?: number;
  height?: number;
}

export interface OfficialBgm {
  id: string;
  url: string;
  coverKey: string;
  label: string;
  artist: string;
  category: string;
  categoryLabel: string;
  categoryLabelEn: string;
  moods: string[];
  useCases: string[];
  energy: string;
  narrationFit: string;
  loopHint: boolean;
  source: string;
  license: string;
  durationSec?: number;
}

export interface OfficialAssetsResponse {
  stickers?: OfficialSticker[];
  bgm?: OfficialBgm[];
  stickerCategories?: OfficialCategory[];
  bgmCategories?: OfficialCategory[];
  summary?: { deferredAnimatedStickers?: number };
}
