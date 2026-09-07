/** Static demonstration frames. Text styles come from the same preset table as actual captions. */
export const CAPTION_EXAMPLES = [
  { preset: 'kw-yellow', image: new URL('./workflow-art/caption-creator.webp', import.meta.url).href, title: { zh: '重点突出', en: 'Highlight' } },
  { preset: 'em-yellow', image: new URL('./workflow-art/caption-podcast.webp', import.meta.url).href, title: { zh: '逐词跟读', en: 'Follow along' } },
  { preset: 'ln-black', image: new URL('./workflow-art/caption-teacher.webp', import.meta.url).href, title: { zh: '经典字幕', en: 'Classic' } },
] as const;
