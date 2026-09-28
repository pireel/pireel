import { useEffect, useMemo, useRef, useState } from 'react';
import { captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { emptyComposition, type CaptionStyle, type Composition } from '@pireel/studio-engine/composition';
import { InlineBlockPreview } from './block-preview-card';

/**
 * A sample caption drawn by the engine's own renderer over footage: the production block assembler
 * mounted in the page (no iframe), so a look picked on a style card shows here as it will render.
 * `text` separates words with `|`; the frame holds on the caption's resting state.
 */
export function CaptionStageSample({ style, canvas, text, subText }: {
  style: Partial<CaptionStyle>; canvas: { width: number; height: number }; text: string; subText?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.round(element.getBoundingClientRect().width)));
    observer.observe(element);
    setWidth(Math.round(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  const comp = useMemo<Composition>(() => ({ ...emptyComposition(), width: Math.round(canvas.width), height: Math.round(canvas.height), captionStyle: { ...style, on: true } as CaptionStyle }), [style, canvas.width, canvas.height]);
  const block = useMemo(() => {
    const words = text.split('|').map(word => word.trim()).filter(Boolean);
    const step = 3 / words.length;
    const segment = { text: words.join(/[A-Za-z]/.test(text) ? ' ' : ''), start: 0, end: 3, words: words.map((word, index) => ({ text: word, start: index * step, end: (index + 1) * step })), ...(subText ? { sub: subText } : {}) };
    return { ...captionBlocksFromAsr([segment], { preset: style.preset })[0]!, id: 'caption_sample' };
  }, [text, subText, style.preset, comp]);
  // A new look or animation plays once; moving the caption up or down does not.
  const replayKey = useMemo(() => { const { yPct: _y, sub, ...look } = style; const { yPct: _sy, ...subLook } = sub ?? {}; return JSON.stringify([look, subLook]); }, [style]);
  return <div ref={host} className="absolute inset-0">
    {width > 0 && <InlineBlockPreview comp={comp} block={block} width={width} ground="none" replayKey={replayKey} />}
  </div>;
}
