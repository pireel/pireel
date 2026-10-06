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
export const METHOD_VERSION = 'brand-method-25';

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
  { id: 'sound', kind: 'fixed', look: 'Loudness and how tightly pauses are cut, measured; whether edits add sound effects is the creator\'s switch.' },
  { id: 'bookends', kind: 'fixed', look: 'The same clip at the start (often after a cold open) or the end of every video.', pitfalls: 'Title cards with the same layout but different words are layout, not a fixed clip.' },
  { id: 'overlay_text', kind: 'prose', look: 'Overlay text (花字): words the creator puts straight on the picture besides captions — headline bands, opening labels, chapter or point labels, emphasis words: type character, colour, stroke, shadow or plate, size, how key words are emphasised, how it enters and leaves, on what moments it is used, and how the words read (real examples).',
    pitfalls: 'Captions follow the speech and are not overlay text. Words inside the creator\'s charts and cards belong to graphics. Text that belongs to the filmed scene (signs, packaging, a screen in the room) is not the creator\'s. Describe the convention, not one video\'s words; when the creator puts no words straight on the picture, leave the block out.' },
  { id: 'visual', kind: 'prose', look: 'The picture, written for an editor who gets a new talking video from this creator, some or all of its B-roll from them, and can generate or find the rest: which moments leave the speaker and what kind of picture each gets (for example "every factual claim gets visual evidence; numbers become a chart or a figure card; opinions stay on the speaker"); how B-roll sits with the speaker — full screen, the speaker kept in a picture-in-picture (its shape, corner and border), split screens, cards beside the speaker — and punch-ins, rhythm and transitions; and, for moments the creator\'s material does not cover, what to make and how it should look (news-like real footage, documents, illustrations in a certain manner, AI pictures). B-roll is anything besides the speaker: own or news footage, screenshots, documents, recordings, photos, stock, illustrations, AI-made pictures, charts and other graphics, memes.',
    pitfalls: 'Write only what an edit can do with the speaker footage, the B-roll and generation: the set, wardrobe, lighting and camera of the speaker footage are decided when it is filmed, not in the edit. A switch to another camera angle is multi-cam, not a punch-in. Jump cuts are how the talk is cut, not a transition. Write what depends on the topic as a kind of content ("a named person"), never the particular one. How many per video depends on the content: describe the moments and the restraint, never a rate or an interval.' },
  { id: 'graphics', kind: 'prose', look: 'How the graphics the creator makes look — number cards, lists, comparisons, charts, arrows, highlight boxes, lower thirds, price tags; the platform\'s ready-made components are of this kind. They are made from what is said, whatever B-roll the editor is given. When and where they appear belongs to the picture; this is their design: the conventions every graphic keeps (how titles are set, how figures are shown, how data and documents are marked); how colours are chosen for a video from its picture and topic — the family, key and contrast they stay in, what each colour does and where it stops (for example "one accent fills only chips and a single stat figure; headlines stay in the text colour") — and the character of the type by role (display and labels), never particular colours or typefaces (one video\'s, at most, as an example); shape language (corners, outlines, shadows, glass, 3D), and how they enter, hold and leave.',
    pitfalls: 'Captions, the creator\'s logo and scene text are not graphics. Colours drawn from one video\'s subject (a country\'s flag, a brand, a product) are that topic\'s, not the creator\'s.' },
  { id: 'structure', kind: 'prose', look: 'How a video opens (straight to camera, a question, a claim, a cover frame at 0 s, a teaser, result first), how the body is organised (points, recaps, chapters), and how it ends (sign-off line, call to action, end card).',
    pitfalls: 'The opening is a per-video choice more than a fingerprint: write it as the usual way, not a rule.' },
  { id: 'cover', kind: 'cover', look: 'How a cover is made for a new video, in two parts: which still of the new video it is built on (expression, gesture, gaze, framing, who — never how the person looks), and how that still becomes the cover (the person\'s treatment and placement, what else goes on it, background, how the headline is worded and lettered, colour, marks, finish).',
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
  'how the speaker footage is filmed — set, wardrobe, lighting, camera (the shoot decides it; the edit cannot)',
] as const;

export const blockGuide = (id: BlockId) => BLOCK_GUIDE.find(item => item.id === id)!;
export const PROSE_BLOCKS = BLOCK_GUIDE.filter(item => item.kind === 'prose').map(item => item.id);

/**
 * The words a reading notes each looked-at moment in — what the speech is about, what B-roll goes on screen
 * and how it is shown — so the synthesis can see a creator's habits across moments and videos. They stay
 * inside the extraction: the brand says the principle behind the habits, never a table of them.
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

/** Windows looked at closely in each video. */
export const WINDOWS = { openingSec: 8, closingSec: 10, moments: 4, momentSec: 4, framesPerWindow: 8 } as const;
