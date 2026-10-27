import { describe, expect, it } from 'vitest';
import { renderBlock } from './composition';
import { captionBlock } from './block-factory';
import { CAPTION_ART_PRESETS, CAPTION_LOOK_HINTS, CAPTION_PRESETS, CAPTION_STYLE_PRESETS, getCaptionPreset } from './caption-presets';
import { captionLineSegments, captionStackRows } from './caption-layout-metrics';

const words = ['今天', '我们', '来', '聊聊', '短视频', '字幕', '到底', '怎么', '做'].map((text, i) => ({ text, start: i * 0.2, end: i * 0.2 + 0.2 }));
const renderCue = (preset: string, animation?: string) => {
  const cue = captionLineSegments(words, getCaptionPreset(preset), 56, 1, 1080)[0]!;
  const block = captionBlock({ words: cue, cue: true });
  return { cue, out: renderBlock({ ...block, slots: { ...block.slots, preset, ...(animation ? { animation } : {}) } }) };
};

describe('stacked artistic captions', () => {
  it('derives cues that never exceed two rows', () => {
    for (const preset of CAPTION_ART_PRESETS.filter((preset) => preset.stack)) {
      expect(preset.stack!.maxRows).toBeLessThanOrEqual(2);
      for (const cue of captionLineSegments(words, preset, 56, 1, 1080)) {
        expect(captionStackRows(cue, preset, 56, 1, 1080).length).toBeLessThanOrEqual(preset.stack!.maxRows);
      }
    }
  });
  it('renders each row with its own size and color, and tilts the whole caption', () => {
    const { out } = renderCue('art-keyline');
    expect(out.innerHtml).toContain('class="cap-row r1"');
    expect(out.innerHtml).toMatch(/\.cap-row\.r1 \.w \{ font-size:96px; color:#ffe34f; \}/);
    expect(renderCue('art-beast').out.innerHtml).toContain('rotate(-3deg)');
    expect(renderCue('art-beast').out.innerHtml).toContain('text-transform:uppercase');
  });
  it('gives per-row plates instead of one stack plate', () => {
    const { out } = renderCue('art-ribbon');
    expect(out.innerHtml).toMatch(/\.cap-row\.r0 \{ background:#ff3b6b;/);
    expect(out.innerHtml).toMatch(/\.cap-row\.r1 \{ background:#161616;/);
  });
  it('returns karaoke words to their own row color', () => {
    const { cue, out } = renderCue('art-beast', 'karaoke');
    const rows = captionStackRows(cue, getCaptionPreset('art-beast'), 56, 1, 1080);
    const last = cue.length - 1;
    expect(rows.length).toBe(2);
    expect(out.timelineBody).toContain(`-w${last} .t', { color:'#ffe600' }`);
  });
  it('offers single-line artistic looks that use the caption width', () => {
    const lines = CAPTION_ART_PRESETS.filter((preset) => !preset.stack);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const preset of lines) {
      const cue = captionLineSegments(words, preset, 74, .6, 1080)[0]!;
      expect(cue.length).toBeGreaterThan(captionLineSegments(words, getCaptionPreset('art-beast'), 74, .6, 1080)[0]!.length);
      expect(captionStackRows(cue, preset, 74, .6, 1080)).toEqual([]);
    }
  });
  it('describes every current look for agents, and only real ones', () => {
    const current = [...CAPTION_ART_PRESETS, ...CAPTION_STYLE_PRESETS].map((preset) => preset.id);
    expect(Object.keys(CAPTION_LOOK_HINTS).sort()).toEqual([...current].sort());
    for (const id of Object.keys(CAPTION_LOOK_HINTS)) expect(CAPTION_PRESETS.some((preset) => preset.id === id)).toBe(true);
  });
});
