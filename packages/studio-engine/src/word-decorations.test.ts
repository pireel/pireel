import { describe, expect, it } from 'vitest';
import { captionBlocksFromAsr, type AsrSegment } from './build-blocks';
import { displayCues } from './captions-relay';
import { renderBlock, type VideoShot } from './composition';
import { applyWordDecorations } from './word-decorations';
import { applyCaptionTextEdits } from './caption-text-edit';
import { carryCaptionEdits } from './editor-document/caption-transcript-sync';

const source: AsrSegment[] = [{
  start: 0, end: 1, text: '保护标签',
  words: [
    { text: '保护', start: 0, end: 0.5 },
    { text: '标签', start: 0.5, end: 1 },
  ],
}];
const shots: VideoShot[] = [{ id: 'shot', srcStart: 0, srcEnd: 1, treatment: 'full' }];

describe('selected-word caption treatment', () => {
  it('keeps unrelated treatment when one field changes and removes empty marks', () => {
    const highlighted = applyWordDecorations(source, [{ sentenceIndex: 0, wordIndex: 1 }], { highlight: 'color' });
    const animated = applyWordDecorations(highlighted, [{ sentenceIndex: 0, wordIndex: 1 }], { animation: 'pop' });
    expect(animated[0]!.wordDecorations?.['1']).toEqual({ highlight: 'color', animation: 'pop' });
    expect(applyWordDecorations(animated, [{ sentenceIndex: 0, wordIndex: 1 }], { highlight: null })[0]!.wordDecorations?.['1']).toEqual({ animation: 'pop' });
    expect(applyWordDecorations(animated, [{ sentenceIndex: 0, wordIndex: 1 }], { animation: null, highlight: null })[0]).not.toHaveProperty('wordDecorations');
    expect(source[0]!.words).toEqual(highlighted[0]!.words);
  });

  it('survives transcript mapping and renders the marked word with its animation', () => {
    const decorated = applyWordDecorations(source, [{ sentenceIndex: 0, wordIndex: 1 }], { highlight: 'underline', animation: 'rise' });
    const cues = displayCues(shots, decorated, {});
    const block = captionBlocksFromAsr(cues).find((candidate) => (candidate.slots.words as { text: string }[]).some((word) => word.text === '标签'))!;
    const rendered = renderBlock(block);
    expect(rendered.innerHtml).toContain('word-underline');
    expect(rendered.timelineBody).toContain('power2.out');
  });

  it('keeps the treatment after caption-copy correction and an ASR refresh', () => {
    const decorated = applyWordDecorations(source, [{ sentenceIndex: 0, wordIndex: 1 }], { highlight: 'color', color: '#C6FF48' });
    const corrected = applyCaptionTextEdits(decorated, [{ index: 0, w0: 1, w1: 1, text: '标记', lock: true }]);
    const refreshed = carryCaptionEdits(corrected, source);
    expect(refreshed[0]!.wordDecorations?.['1']).toEqual({ highlight: 'color', color: '#C6FF48' });
    const blocks = captionBlocksFromAsr(displayCues(shots, corrected, {}));
    expect(blocks.some((block) => renderBlock(block).innerHtml.includes('word-color'))).toBe(true);
    expect(blocks.some((block) => renderBlock(block).innerHtml.includes('--word-highlight:#C6FF48'))).toBe(true);
  });
});
