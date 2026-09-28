import { expect, it } from 'vitest';
import { pipGeometry, resolvePipGeometry, validPipOptions, type PipBox, type PipCorner, type PipSize } from './pip-layout';
const portrait = { width: 1080, height: 1920 };
const landscape = { width: 1920, height: 1080 };
const square = { width: 1080, height: 1080 };
const inBounds = (box: PipBox) => { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x + box.w).toBeLessThanOrEqual(1.000001); expect(box.y + box.h).toBeLessThanOrEqual(1.000001); };
it('preserves both inset aspect ratios for wide, square and tall footage without covering the default caption band', () => {
  for (const canvas of [portrait, landscape, square]) for (const media of [portrait, landscape, square]) for (const size of ['small', 'medium', 'large'] as PipSize[]) {
    const box = pipGeometry('inset', canvas, media, { size }).media;
    inBounds(box);
    expect(box.w * canvas.width / (box.h * canvas.height)).toBeCloseTo(media.width / media.height, 6);
    expect(box.y + box.h).toBeCloseTo(.79, 6);
    const inset = pipGeometry('presenter', canvas, media, { size }, portrait);
    expect(inset.media).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    inBounds(inset.speaker!);
    expect(inset.speaker!.w * canvas.width / (inset.speaker!.h * canvas.height)).toBeCloseTo(9 / 16, 6);
  }
});
it('lets users move the inset into any corner while keeping size and aspect stable', () => {
  const corners: PipCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const boxes = corners.map(position => pipGeometry('inset', portrait, landscape, { position }).media);
  boxes.forEach(inBounds);
  expect(boxes[0].y).toBe(.06); expect(boxes[0].x).toBe(.04);
  expect(boxes[1].x + boxes[1].w).toBeCloseTo(.96);
  expect(boxes[2].y + boxes[2].h).toBeCloseTo(.79);
  expect(new Set(boxes.map(box => box.w))).toHaveLength(1);
});
it('fills the split canvas with adjacent panels and uses an upper source crop for portrait speakers', () => {
  for (const canvas of [portrait, landscape]) {
    const split = pipGeometry('split', canvas, landscape, {}, portrait);
    inBounds(split.media); inBounds(split.speaker!);
    expect(split.media.w * split.media.h + split.speaker!.w * split.speaker!.h).toBeCloseTo(1);
    expect(split.mediaFit).toBe('contain'); expect(split.speakerFit).toBe('cover');
    expect(split.speakerAnchorY).toBe(.4);
    if (canvas === portrait) expect(split.media.y + split.media.h).toBe(split.speaker!.y);
    else expect(split.media.x + split.media.w).toBe(split.speaker!.x);
  }
  expect(pipGeometry('split', portrait, landscape, { speakerFit: 'contain' }).speakerFit).toBe('contain');
});
it('uses content proportions for smart layouts and applies the same geometry to all options', () => {
  expect(pipGeometry('smart', portrait, landscape)).toEqual(pipGeometry('split', portrait, landscape));
  expect(pipGeometry('smart', portrait, portrait)).toEqual(pipGeometry('presenter', portrait, portrait));
  expect(resolvePipGeometry({ template: 'presenter' }, portrait, landscape).media).toEqual({ x: 0, y: 0, w: 1, h: 1 });
});
it('validates framing controls before persistence', () => {
  expect(validPipOptions({ template: 'smart' })).toBe(true);
  expect(validPipOptions({ template: 'inset', position: 'bottom-left', size: 'large', mediaFit: 'cover' })).toBe(true);
  for (const patch of [{ position: 'middle' }, { size: 10 }, { mediaFit: 'stretch' }, { speakerFit: 'stretch' }]) expect(validPipOptions({ template: 'inset', ...patch })).toBe(false);
});

it('keeps cutout presenters inside the canvas overlapping footage while fitting small insets without distortion', () => {
  for (const canvas of [portrait, landscape, square]) for (const source of [portrait, landscape]) {
    for (const template of ['cutout', 'cutout-small'] as const) {
      const geometry = pipGeometry(template, canvas, landscape, {}, source);
      expect(geometry.speakerCutout).toBe(true);
      expect(geometry.speakerFit).toBe(template === 'cutout' ? 'cover' : 'contain');
      inBounds(geometry.speaker!); inBounds(geometry.media);
      const speaker = geometry.speaker!;
      if (template === 'cutout-small') expect(speaker.w * canvas.width / (speaker.h * canvas.height)).toBeCloseTo(source.width / source.height);
      expect(speaker.x).toBeLessThan(geometry.media.x + geometry.media.w);
      expect(speaker.y).toBeLessThan(geometry.media.y + geometry.media.h);
    }
  }
});
