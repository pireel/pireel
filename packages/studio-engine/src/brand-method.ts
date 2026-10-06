import type { BlockId } from './brand-playbook';

/**
 * The method for extracting a creator's brand (one prompt of XML blocks, brand-playbook.ts) from their
 * published videos, distilled from two studies of top talking-head creators (TikTok / YouTube: 100
 * creators, 960 videos; Douyin / Bilibili: 85 creators, 369 videos).
 *
 * How a video is looked at: the opening and the ending always; in between, the moments the speech says
 * are likely to carry a motion graphic, a transition, B-roll or a punch-in (numbers, lists, comparisons,
 * named things, turns, punchlines) — found from the transcript, never at random — plus one overview grid.
 *
 * The block table below is the single source the reading and synthesis prompts follow: which blocks are
 * fixed values (measured, applied by the engine) and which are prose for the models, what to look for,
 * and what goes wrong. Raise METHOD_VERSION whenever a row, a tool or a prompt changes; every brand
 * records the version that made it.
 */
export const METHOD_VERSION = 'brand-method-18';

export interface BlockGuide {
  id: BlockId;
  /** Fixed: values measured and applied by the engine. Prose: written for the models from the videos.
   *  Cover: written from the creator's covers, in its own step. */
  kind: 'fixed' | 'prose' | 'cover';
  /** What to look for — the text the reading and synthesis prompts carry. */
  look: string;
  /** Known false readings to guard against. */
  pitfalls?: string;
}

export const BLOCK_GUIDE: readonly BlockGuide[] = [
  { id: 'portrait', kind: 'prose', look: 'The style in two to four sentences: what kind of videos, the tone, the pace, what makes them recognisable — the positioning and feel only; the techniques that make it belong to their own blocks.' },
  { id: 'captions', kind: 'fixed', look: 'Burned-in captions: typeface character, fill, outline / shadow / plate, size, how much text shows at once, how key words are marked.',
    pitfalls: 'Captions follow the speech; a headline held still, a label over the opening, signs, packaging and screen text are not captions. A second speaker in another colour is not keyword marking.' },
  { id: 'logo', kind: 'fixed', look: 'A mark held in one corner across videos.', pitfalls: 'Platform watermarks are not the creator\'s logo.' },
  { id: 'sound', kind: 'fixed', look: 'Loudness and how tightly pauses are cut are measured; in prose, only what frames can show about music and sound effects (credits, visual beats).', pitfalls: 'Frames carry no audio: never claim a sound you cannot see evidence of.' },
  { id: 'bookends', kind: 'fixed', look: 'The same clip at the start (often after a cold open) or the end of every video.', pitfalls: 'Title cards with the same layout but different words are layout, not a fixed clip.' },
  { id: 'overlay_text', kind: 'prose', look: 'Overlay text (花字): the words the creator puts on screen besides captions — the words of headline bands, opening labels, chapter or point labels, emphasis words, text inside graphics: type character, colours as #RRGGBB, stroke, shadow or plate, size, how key words are emphasised, how it enters and leaves, on what moments it is used, and how the words read (real examples).',
    pitfalls: 'Captions follow the speech and are not overlay text. Text that belongs to the filmed scene (signs, packaging, a screen in the room) is not the creator\'s. Describe the convention, not one video\'s words.' },
  { id: 'visual', kind: 'prose', look: 'The picture around the B-roll the table plans: how the speaker appears (framing, where they sit, punch-ins and on what), the moments that stay on the speaker, the rhythm (how long B-roll runs, how it returns to the speaker) and transitions. What goes on screen for each kind of content is the table, not this prose.',
    pitfalls: 'A switch to another camera angle is multi-cam, not a punch-in. Jump cuts are how the talk is cut, not a transition. Write what depends on the topic as a kind of content ("a named person"), never the particular one. How many per video depends on the content: describe the moments and the restraint, never a rate or an interval.' },
  { id: 'graphics', kind: 'prose', look: 'How the graphics the creator makes look — number cards, lists, comparisons, charts, arrows, highlight boxes, lower thirds, price tags; the platform\'s ready-made components are of this kind. When and where they appear belongs to the picture; this is their design: each colour with its role and its limits (for example "accent coral fills only chips, pill bars and one stat figure; headlines stay in the ink colour"), the type by role (display and labels), shape language (corners, outlines, shadows, glass, 3D), and how they enter, hold and leave.',
    pitfalls: 'Captions, the creator\'s logo and scene text are not graphics.' },
  { id: 'structure', kind: 'prose', look: 'How a video opens (straight to camera, a question, a claim, a cover frame at 0 s, a teaser, result first), how the body is organised (points, recaps, chapters), and how it ends (sign-off line, call to action, end card).',
    pitfalls: 'The opening is a per-video choice more than a fingerprint: write it as the usual way, not a rule.' },
  { id: 'cover', kind: 'cover', look: 'How a cover is made for a new video, in three parts: which still of the video it is built on (expression, gesture, gaze, framing, who), how its headline is worded, and how still and headline become the cover (crop, placement, background, lettering, marks, finish).',
    pitfalls: 'Written from the creator\'s covers, never from frames of the videos. One cover\'s words or person are not the style.' },
];

/**
 * How colour is described wherever it is not fixed (overlay text, cover, layout): a strategy a designer can
 * follow, not a list of values that changes with every topic.
 */
export const COLOUR_GUIDE = 'Describe colour as a strategy, not a list: the hue relationship (one hue, analogous, complementary, clashing), the value and saturation key (vivid, muted, pastel, neon, dark), the rough share of the dominant, secondary and accent colours (for example white 80 / yellow 15 / other 5), how contrast is made (light against dark, or hue against hue), and where colours come from (kept by the creator, taken from the footage or the product, chosen by the topic). Give #RRGGBB only for signature colours that recur across videos.';

/** Never part of a brand: decided by the footage, the platform or the moment. */
export const NOT_BRAND = [
  'aspect ratio (follows the footage; the export target converts it)',
  'shot size of each moment',
  'how many cuts, zooms or B-roll shots one video has, or at what interval',
  'colour grade saturation and temperature (set by the location)',
] as const;

export const blockGuide = (id: BlockId) => BLOCK_GUIDE.find(item => item.id === id)!;
export const PROSE_BLOCKS = BLOCK_GUIDE.filter(item => item.kind === 'prose').map(item => item.id);

/**
 * The words the picture is planned in, the same when a creator's videos are read and when a new video is
 * cut: what the speech is about at a moment, what B-roll goes on screen, and how it is shown. A brand's
 * table maps the first to the other two, so it applies to any topic.
 */
export const SPEECH_KINDS = {
  number: { zh: '数字/趋势', en: 'a number or trend' }, person: { zh: '人物', en: 'a person' }, company: { zh: '公司/品牌', en: 'a company or brand' },
  product: { zh: '产品', en: 'a product' }, place: { zh: '地点', en: 'a place' }, event: { zh: '事件/政策', en: 'an event or policy' },
  concept: { zh: '概念/流程', en: 'a concept or process' }, comparison: { zh: '对比', en: 'a comparison' }, opinion: { zh: '观点', en: 'an opinion' },
  story: { zh: '故事', en: 'a story' }, joke: { zh: '笑点', en: 'a joke' },
} as const;
export const BROLL_SOURCES = {
  chart: { zh: '图表/数据卡', en: 'a chart or data card' }, photo: { zh: '照片', en: 'a photo' }, screenshot: { zh: '截图', en: 'a screenshot' },
  document: { zh: '文件', en: 'a document' }, screen_recording: { zh: '录屏', en: 'a screen recording' }, news_footage: { zh: '新闻画面', en: 'news footage' },
  own_footage: { zh: '自己拍的', en: 'own footage' }, stock: { zh: '图库', en: 'stock footage' }, illustration: { zh: '插画/3D 动画', en: 'an illustration or 3D animation' },
  ai: { zh: 'AI 生成', en: 'an AI-made image or video' }, meme: { zh: '表情包', en: 'a meme' }, product_shot: { zh: '产品特写', en: 'a product shot' },
} as const;
export const PRESENTATIONS = {
  speaker: { zh: '留在人物', en: 'stay on the speaker' }, full_frame: { zh: '全屏', en: 'full frame' }, speaker_pip: { zh: '全屏+人物画中画', en: 'full frame, the speaker in picture-in-picture' },
  window: { zh: '窗口', en: 'a window over the speaker' }, split: { zh: '分屏', en: 'split screen' }, beside_speaker: { zh: '人物旁边', en: 'beside the speaker' },
} as const;
export type SpeechKind = keyof typeof SPEECH_KINDS;
export type BrollSource = keyof typeof BROLL_SOURCES;
export type Presentation = keyof typeof PRESENTATIONS;
export const COVERAGE = { light: { zh: '少量', en: 'rarely' }, medium: { zh: '适中', en: 'at times' }, heavy: { zh: '大量', en: 'most of the time' } } as const;
export type Coverage = keyof typeof COVERAGE;

/** Windows looked at closely in each video. */
export const WINDOWS = { openingSec: 8, closingSec: 10, moments: 4, momentSec: 4, framesPerWindow: 8 } as const;
