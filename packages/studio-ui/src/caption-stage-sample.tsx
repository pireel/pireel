import { useEffect, useMemo, useRef, useState } from 'react';
import { captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { emptyComposition, type CaptionStyle, type Composition } from '@pireel/studio-engine/composition';
import { getCaptionPreset } from '@pireel/studio-engine/caption-presets';
import { InlineBlockPreview } from './block-preview-card';

/** Seconds per sample word: about the pace of speech, so word effects read as they will in a video. */
const WORD_SEC = 0.32;
/** Resting time after the last word before the cue ends. */
const TAIL_SEC = 0.5;

function useWidth() {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return [host, width] as const;
}

/** One display cue, the unit the editor and export render (the stack owns position and tilt), not a
 *  legacy sentence block whose lines carry their own centering transform. `text` splits on `|`. */
function sampleCue(id: string, text: string, preset: string | undefined, subText?: string) {
  const words = text.split('|').map(word => word.trim()).filter(Boolean);
  const segment = {
    text: words.join(/[A-Za-z]/.test(text) ? ' ' : ''), start: 0, end: words.length * WORD_SEC + TAIL_SEC, cue: true,
    words: words.map((word, index) => ({ text: word, start: index * WORD_SEC, end: (index + 1) * WORD_SEC })),
    ...(subText ? { sub: subText } : {}),
  };
  return { ...captionBlocksFromAsr([segment], { preset })[0]!, id };
}

/**
 * A sample caption drawn by the engine's own renderer over footage: the production block assembler
 * mounted in the page (no iframe), so a look picked on a style card shows here as it will render.
 * A new look or animation plays once; moving the caption does not replay.
 */
export function CaptionStageSample({ style, canvas, text, subText }: {
  style: Partial<CaptionStyle>; canvas: { width: number; height: number }; text: string; subText?: string;
}) {
  const [host, width] = useWidth();
  const comp = useMemo<Composition>(() => ({ ...emptyComposition(), width: Math.round(canvas.width), height: Math.round(canvas.height), captionStyle: { ...style, on: true } as CaptionStyle }), [style, canvas.width, canvas.height]);
  const block = useMemo(() => sampleCue('caption_sample', text, style.preset, subText), [text, subText, style.preset, comp]);
  const replayKey = useMemo(() => { const { yPct: _y, sub, ...look } = style; const { yPct: _sy, ...subLook } = sub ?? {}; return JSON.stringify([look, subLook]); }, [style]);
  return <div ref={host} className="absolute inset-0">
    {width > 0 && <InlineBlockPreview comp={comp} block={block} width={width} ground="none" replayKey={replayKey} />}
  </div>;
}

/** A looping sample of one caption animation in the current look, for the animation cards: the
 *  same renderer as the preview and export, so a card shows what picking it does. */
export function CaptionMotionSample({ id, style, text }: { id: string; style: Partial<CaptionStyle>; text: string }) {
  const [host, width] = useWidth();
  // A short strip canvas keeps the caption large inside a small card; stacked looks take two rows,
  // so they sit lower and a little smaller to fit whole.
  const stacked = !!getCaptionPreset(style.preset).stack;
  const comp = useMemo<Composition>(() => ({ ...emptyComposition(), width: 540, height: 240, captionStyle: { ...style, sub: undefined, xPct: 50, yPct: stacked ? 92 : 70, wPct: 94, scale: stacked ? 0.72 : Math.min(style.scale ?? 1, 1), on: true } as CaptionStyle }), [style, stacked]);
  const block = useMemo(() => sampleCue(`caption_motion_${id}`, text, style.preset), [id, text, style.preset, comp]);
  return <div ref={host} className="h-full w-full">
    {width > 0 && <InlineBlockPreview comp={comp} block={block} width={width} ground="none" animate />}
  </div>;
}
