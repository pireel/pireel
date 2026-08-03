/**
 * The gen panel's "Template" library: curated ready-to-reuse prompts; one click drops them into the input to generate.
 *
 * - Image templates: pulled from the open-source leaderboard nanobanana-trending-prompts
 *   (jau123/nanobanana-trending-prompts), taking several high-scorers per common creator
 *   scenario (poster/graphic/illustration-3D/product-brand/photography/food). Preview images
 *   are re-hosted on our R2 (key studio/gen-templates/<id>.jpg, bare key), all shown via imageThumb, no external links.
 * - Video templates: a self-authored batch of talking-head B-roll / camera-move / cutaway /
 *   mood prompts (no ready leaderboard for video sources). If there's a finished preview clip,
 *   fill video (bare R2 key, card loops a small video); otherwise fall back to a title placeholder card.
 * - Component templates: finished bundled overlay components with live previews.
 * - Audio templates come from the official-assets catalog at runtime, so cards play the
 *   licensed files and show their uploaded covers instead of acting as prompt presets.
 *
 * Panel logic: nothing generated yet → show templates directly; once the user has their own
 * output → show two tabs ("Mine / Templates") at the top.
 */

import type { GenTemplate } from './gen-templates/types';
import { POSTER_TEMPLATES } from './gen-templates/poster';
import { UI_GRAPHIC_TEMPLATES } from './gen-templates/ui-graphic';
import { ILLUSTRATION_3D_TEMPLATES } from './gen-templates/illustration-3d';
import { PRODUCT_BRAND_TEMPLATES } from './gen-templates/product-brand';
import { PHOTOGRAPHY_TEMPLATES } from './gen-templates/photography';
import { FOOD_DRINK_TEMPLATES } from './gen-templates/food-drink';
import { VIDEO_TEMPLATES } from './gen-templates/video';
import { ELEMENT_TEMPLATES } from './gen-templates/element';

export type { GenTemplate } from './gen-templates/types';
export { localizedTemplatePrompt } from './gen-templates/types';
export { ELEMENT_TEMPLATES, VIDEO_TEMPLATES };

export const TEMPLATE_CATEGORY_ZH: Record<string, string> = {
  'Poster Design': 'chatGen.poster',
  'UI & Graphic': 'chatGen.uiGraphic',
  'Illustration & 3D': 'chatGen.illustration3d',
  'Product & Brand': 'chatGen.productBrand',
  Photography: 'chatGen.photography',
  'Food & Drink': 'chatGen.foodDrink',
  运镜: 'chatGen.cameraMoves',
  空镜: 'chatGen.bRoll',
  产品: 'chatGen.product',
  氛围: 'chatGen.ambience',
  人物: 'chatGen.people',
};

export const zhCategory = (c: string): string => TEMPLATE_CATEGORY_ZH[c] ?? c;


/** Image templates (one file per category under gen-templates/, concatenated in display order). */
export const IMAGE_TEMPLATES: GenTemplate[] = [
  ...POSTER_TEMPLATES,
  ...UI_GRAPHIC_TEMPLATES,
  ...ILLUSTRATION_3D_TEMPLATES,
  ...PRODUCT_BRAND_TEMPLATES,
  ...PHOTOGRAPHY_TEMPLATES,
  ...FOOD_DRINK_TEMPLATES,
];

export const TEMPLATES_BY_TYPE: Record<'image' | 'video' | 'element' | 'audio', GenTemplate[]> = {
  image: IMAGE_TEMPLATES,
  video: VIDEO_TEMPLATES,
  element: ELEMENT_TEMPLATES,
  audio: [],
};
