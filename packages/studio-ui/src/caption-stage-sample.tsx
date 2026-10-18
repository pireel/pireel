import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { emptyComposition, type CaptionStyle, type Composition } from '@pireel/studio-engine/composition';
import { getCaptionPreset } from '@pireel/studio-engine/caption-presets';
import { InlineBlockPreview } from './block-preview-card';
import { loadFont } from './web-fonts';

/** Seconds per sample word: about the pace of speech, so word effects read as they will in a video. */
const WORD_SEC = 0.32;
/** Resting time after the last word before the cue ends. */
const TAIL_SEC = 0.5;

function useWidth() {
  const [host, width] = useSize();
  return [host, width.width] as const;
}

function useSize() {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); setSize(current => current.width === Math.round(rect.width) && current.height === Math.round(rect.height) ? current : { width: Math.round(rect.width), height: Math.round(rect.height) }); };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return [host, size] as const;
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
  const sampleId = `caption_sample_${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const [host, width] = useWidth();
  // A library or Google face is fetched for the sample's words, and the sample drawn again once it is on
  // the device (a face named in a brand is otherwise only fetched when picked by hand).
  const [facesLoaded, setFacesLoaded] = useState(0);
  const faces = [style.font, style.sub?.font].filter((font): font is string => !!font).join('|');
  useEffect(() => {
    if (!faces) return;
    let live = true;
    const words = [text, subText ?? ''].join('').replace(/\|/g, '');
    void Promise.all(faces.split('|').map(font => loadFont(font, words))).then(() => { if (live) setFacesLoaded(count => count + 1); });
    return () => { live = false; };
  }, [faces, text, subText]);
  const comp = useMemo<Composition>(() => ({ ...emptyComposition(), width: Math.round(canvas.width), height: Math.round(canvas.height), captionStyle: { ...style, on: true } as CaptionStyle }), [style, canvas.width, canvas.height, facesLoaded]);
  const block = useMemo(() => sampleCue(sampleId, text, style.preset, subText), [sampleId, text, subText, style.preset, comp]);
  const replayKey = useMemo(() => { const { yPct: _y, sub, ...look } = style; const { yPct: _sy, ...subLook } = sub ?? {}; return JSON.stringify([look, subLook]); }, [style]);
  return <div ref={host} className="absolute inset-0">
    {width > 0 && <InlineBlockPreview comp={comp} block={block} width={width} ground="none" replayKey={replayKey} />}
  </div>;
}

/** A looping sample of one caption animation in the current look, for the animation cards: the
 *  same renderer as the preview and export, so a card shows what picking it does. */
export function CaptionMotionSample({ id, style, text }: { id: string; style: Partial<CaptionStyle>; text: string }) {
  const [host, size] = useSize();
  const width = size.width;
  // A short strip canvas keeps the caption large inside a small card; stacked looks take two rows,
  // so they sit lower and a little smaller to fit whole. The strip takes the card's own shape, so the
  // caption stays inside however wide the card is laid out.
  const stacked = !!getCaptionPreset(style.preset).stack;
  const stripHeight = size.width > 0 && size.height > 0 ? Math.max(120, Math.round(540 * size.height / size.width)) : 240;
  const comp = useMemo<Composition>(() => ({ ...emptyComposition(), width: 540, height: stripHeight, captionStyle: { ...style, sub: undefined, xPct: 50, yPct: stacked ? 92 : 70, wPct: 94, scale: stacked ? 0.72 : Math.min(style.scale ?? 1, 1), on: true } as CaptionStyle }), [style, stacked, stripHeight]);
  const block = useMemo(() => sampleCue(`caption_motion_${id}`, text, style.preset), [id, text, style.preset, comp]);
  return <div ref={host} className="h-full w-full">
    {width > 0 && <InlineBlockPreview comp={comp} block={block} width={width} ground="none" animate />}
  </div>;
}
