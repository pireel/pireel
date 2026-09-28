import { describe, expect, it } from 'vitest';
import { captionBlocksFromAsr } from './build-blocks';
import { renderBlock, assembleHtml, emptyComposition } from './composition';
import { CAPTION_PRESETS, CAPTION_STYLE_PRESETS } from './caption-presets';
import { displayCues } from './captions-relay';

const source = [{ start: 0, end: 1.2, text: '你好世界', words: [
  { text: '你好', start: 0, end: 0.5 }, { text: '世界', start: 0.6, end: 1.2 },
] }];
function render(preset: string, animation?: string) {
  const block = captionBlocksFromAsr(source)[0]!;
  return renderBlock({ ...block, slots: { ...block.slots, preset, animation, cue: true } });
}

describe('caption animations', () => {
  it('provides distinct real entrances on whole lines, without requiring word decorations', () => {
    const cases = { fade: 'opacity', rise: '"y":36', pop: '"scale":0.82', slide: '"x":-72', blur: 'blur(8px)' };
    for (const [animation, motion] of Object.entries(cases)) {
      const output = render('style-documentary', animation);
      expect(output.timelineBody).toContain(motion);
      expect(output.timelineBody).toContain('.cap-line');
      expect(output.timelineBody).not.toContain('NaN');
    }
  });
  it('reveals words at their speech timestamps', () => {
    const output = render('style-documentary', 'typewriter');
    expect(output.timelineBody).toContain('.w\', { opacity: 0 }');
    expect(output.timelineBody).toMatch(/w1', \{ opacity: 1 \}, 0\.6\)/);
  });
  it('times word emphasis and returns to the resting state', () => {
    expect(render('style-documentary', 'pulse').timelineBody).toContain('"scale":1.16');
    expect(render('style-documentary', 'pulse').timelineBody).toContain('"scale":1,');
    expect(render('style-documentary', 'bounce').timelineBody).toContain('"y":0');
    expect(render('style-documentary', 'glow').timelineBody).toContain('"textShadow":"none"');
    expect(render('style-documentary', 'marker').innerHtml).toContain('class="deco"');
  });
  it('preserves explicit word highlighting while the animation runs', () => {
    const decorated = [{ ...source[0]!, wordDecorations: { '0': { highlight: 'color' as const, color: '#ff0000', animation: 'rise' as const } } }];
    const cues = displayCues([{ id: 'speech', srcStart: 0, srcEnd: 1.2, treatment: 'full' }], decorated, {});
    const block = captionBlocksFromAsr(cues)[0]!;
    const output = renderBlock({ ...block, slots: { ...block.slots, preset: 'style-documentary', animation: 'pulse', cue: true } });
    expect(output.innerHtml).toContain('--word-highlight:#ff0000');
    expect(output.timelineBody).not.toMatch(/w0 \.t', \{ color:/);
    expect(output.timelineBody).toContain('"scale":1.16');
    expect(output.timelineBody).toContain("color:'#ffe34f'");
    expect(output.timelineBody).not.toContain('y:18');
  });
  it('keeps classic captions static and every preset renderable', () => {
    expect(render('ln-clean').timelineBody).not.toContain('fromTo');
    expect(new Set(CAPTION_PRESETS.map(p => p.id)).size).toBe(CAPTION_PRESETS.length);
    for (const preset of CAPTION_PRESETS) {
      expect(render(preset.id).innerHtml).toContain('你好');
      expect(render(preset.id).timelineBody).not.toContain('undefined');
    }
  });
});

describe('independent appearance and animation', () => {
  it('can combine every visual style with motion or explicitly turn motion off', () => {
    for (const preset of CAPTION_STYLE_PRESETS) {
      const animated = render(preset.id, 'rise');
      expect(animated.timelineBody).toContain('"y":36');
      expect(animated.innerHtml).toContain(preset.text);
      expect(render(preset.id, 'none').timelineBody).not.toContain('fromTo');
    }
    expect(render('em-yellow', 'none').timelineBody).not.toContain('fromTo');
  });
  it('renders real typography and plate differences rather than color variants', () => {
    expect(render('style-outline').innerHtml).toContain('-webkit-text-stroke:0.16em #111111');
    expect(render('style-outline').innerHtml).toContain('font-weight:800');
    expect(render('style-news').innerHtml).toContain('border-radius:0px');
    expect(render('style-paper').innerHtml).toContain('border:0.025em solid #b4a58a');
    expect(render('style-sticker').innerHtml).toContain('text-shadow:4px 5px 0 #ff86b5');
  });
  it('passes separate main and translation animation through preview/export assembly', () => {
    const comp = emptyComposition();
    const block = captionBlocksFromAsr(source)[0]!;
    comp.blocks = [{ ...block, slots: { ...block.slots, sub: 'Hello world' } }];
    comp.captionStyle = { preset: 'style-outline', animation: 'rise', sub: { preset: 'style-paper', animation: 'slide', lang: 'English' } };
    const html = assembleHtml(comp);
    expect(html).toContain(String.raw`\"y\":36`);
    expect(html).toContain(String.raw`\"x\":-72`);
    expect(html).toContain('-webkit-text-stroke');
  });
  it('lets the user recolor whatever the animation emphasizes', () => {
    const block = captionBlocksFromAsr(source)[0]!;
    const karaoke = renderBlock({ ...block, slots: { ...block.slots, preset: 'style-outline', animation: 'karaoke', emphasis: '#ff4d6d', cue: true } });
    expect(karaoke.timelineBody).toContain("color:'#ff4d6d'");
    expect(karaoke.timelineBody).not.toContain('#ffe34f');
    const marker = renderBlock({ ...block, slots: { ...block.slots, preset: 'style-outline', animation: 'marker', emphasis: '#5affb6', cue: true } });
    expect(marker.innerHtml).toContain('background:#5affb6');
    const still = renderBlock({ ...block, slots: { ...block.slots, preset: 'style-outline', animation: 'fade', emphasis: '#5affb6', cue: true } });
    expect(still.timelineBody + still.innerHtml).not.toContain('#5affb6');
  });
  it('applies highlight precedence: chosen color, then the style highlight', () => {
    const block = captionBlocksFromAsr(source)[0]!;
    const words = [
      { text: '你好', start: 0, end: 0.5, decoration: { highlight: 'color' as const } },
      { text: '世界', start: 0.6, end: 1.2, decoration: { highlight: 'color' as const, color: '#123456' } },
      { text: '啊', start: 1.2, end: 1.4 },
    ];
    const slots = { ...block.slots, words, preset: 'style-outline', animation: 'pulse', emphasis: '#ff4d6d', cue: true };
    const spoken = renderBlock({ ...block, slots });
    expect(spoken.innerHtml).toContain('--word-highlight:#ff4d6d'); // no chosen color → style highlight
    expect(spoken.innerHtml).toContain('--word-highlight:#123456'); // chosen color wins
    expect(spoken.timelineBody).toMatch(/-w2 \.t'/); // every spoken word pulses
  });
});
