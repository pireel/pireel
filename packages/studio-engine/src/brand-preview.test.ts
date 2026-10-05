import { describe, expect, it } from 'vitest';
import type { VideoObservation } from './brand-analysis';
import { pickPreviewFrame } from './brand-preview';

const face = (t: number, h = 0.3, x = 0.35) => ({ t, x, y: 0.2, w: h * 0.6, h });
const caption = { text: 'hello there', x: 0.2, y: 0.7, w: 0.6, h: 0.05 };
const speck = { text: '@me', x: 0.9, y: 0.02, w: 0.04, h: 0.02 };
const video = (id: string, ocr: VideoObservation['ocr'], faces: VideoObservation['faces']): VideoObservation => ({ id, durationSec: 30, ocr, faces, cuts: [], headHashes: [], tailHashes: [], overlays: [] });

describe('pickPreviewFrame', () => {
  it('takes a clean frame at the usual framing, ignoring specks and the first second', () => {
    const pick = pickPreviewFrame([video('v1', [{ t: 0.5, boxes: [] }, { t: 2.5, boxes: [caption] }, { t: 4.5, boxes: [speck] }, { t: 6.5, boxes: [] }], [face(0.5), face(2.5), face(4.5), face(6.5, 0.6)])]);
    expect(pick).toEqual({ video: 'v1', t: 4.5, clean: true, textArea: 0 });
  });

  it('falls back to the frame with the least text, marked unclean, when captions never leave', () => {
    const big = { ...caption, h: 0.1 };
    const pick = pickPreviewFrame([video('v1', [{ t: 2.5, boxes: [big] }, { t: 4.5, boxes: [caption] }], [face(2.5), face(4.5)])]);
    expect(pick).toMatchObject({ video: 'v1', t: 4.5, clean: false, textArea: 0.03 });
  });

  it('returns nothing without a face to show', () => {
    expect(pickPreviewFrame([video('v1', [{ t: 2.5, boxes: [] }], [])])).toBeNull();
  });
});
