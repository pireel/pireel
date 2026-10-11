import { expect, it } from 'vitest';
import { applyPipLayout, captionBandFor, PIP_PICKER_TEMPLATES, PIP_SHOT_LAYOUTS, pipGeometry, resolvePipGeometry, validPipOptions, type PipBox, type PipCorner, type PipSize } from './pip-layout';
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
it('ends bottom-corner windows above the captions, wherever the captions sit', () => {
  const band = captionBandFor({ on: true, yPct: 74, scale: 1 })!;
  expect(band.top).toBeCloseTo(.66, 6);
  for (const template of ['presenter', 'inset', 'cutout-small'] as const) {
    const geometry = pipGeometry(template, portrait, landscape, { position: 'bottom-right' }, portrait, band);
    const window = template === 'inset' ? geometry.media : geometry.speaker!;
    inBounds(window);
    expect(window.y + window.h).toBeLessThanOrEqual(band.top);
  }
  // Top corners, captions switched off and captions near the top leave the window where it was.
  expect(pipGeometry('presenter', portrait, landscape, { position: 'top-right' }, portrait, band).speaker!.y).toBeCloseTo(.06, 6);
  expect(captionBandFor({ on: false, yPct: 74 })).toBeUndefined();
  const high = captionBandFor({ on: true, yPct: 30 });
  const plain = pipGeometry('presenter', portrait, landscape, {}, portrait).speaker!;
  expect(pipGeometry('presenter', portrait, landscape, {}, portrait, high).speaker).toEqual(plain);
  // A translation line doubles the band.
  expect(captionBandFor({ on: true, yPct: 74, sub: {} })!.top).toBeCloseTo(.60, 6);
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
it('splits into two equal halves with the footage on top or below', () => {
  const top = pipGeometry('split', portrait, landscape, {}, portrait);
  const below = pipGeometry('split-bottom', portrait, landscape, {}, portrait);
  expect(top.media).toEqual({ x: 0, y: 0, w: 1, h: .5 }); expect(top.speaker).toEqual({ x: 0, y: .5, w: 1, h: .5 });
  expect(below.media).toEqual({ x: 0, y: .5, w: 1, h: .5 }); expect(below.speaker).toEqual({ x: 0, y: 0, w: 1, h: .5 });
  expect(pipGeometry('split-bottom', landscape, landscape).media).toEqual({ x: .5, y: 0, w: .5, h: 1 });
});
it('fills the split canvas with adjacent panels and uses an upper source crop for portrait speakers', () => {
  for (const canvas of [portrait, landscape]) {
    const split = pipGeometry('split', canvas, landscape, {}, portrait);
    inBounds(split.media); inBounds(split.speaker!);
    expect(split.media.w * split.media.h + split.speaker!.w * split.speaker!.h).toBeCloseTo(1);
    expect(split.mediaFit).toBe('cover'); expect(split.speakerFit).toBe('cover');
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
it('lays out each clip in its own layout, and the rest by the template', () => {
  const clip = (id: string, startFrame: number) => ({ id, kind: 'media', assetId: 'wide', startFrame, durationFrames: 30, sourceInSec: 0, sourceOutSec: 1, enabled: true });
  const document = {
    canvas: { ...portrait, fps: 30 }, assets: { wide: { id: 'wide', kind: 'image', metadata: landscape }, talk: { id: 'talk', kind: 'video', metadata: portrait } },
    semantics: { primaryNarrativeTrackId: 'main' }, appearance: {},
    timeline: { tracks: [
      { id: 'main', type: 'visual', clips: [{ id: 'm', kind: 'narrative', assetId: 'talk', startFrame: 0, durationFrames: 300, sourceInSec: 0, sourceOutSec: 10, enabled: true }] },
      { id: 'broll', type: 'visual', clips: [clip('a', 0), clip('b', 60), clip('c', 120)] },
    ] },
  };
  const next = applyPipLayout(document as never, { template: 'smart' }, 'broll', { a: 'inset', b: 'presenter' });
  const boxes = next.timeline.tracks.find(track => track.id === 'broll')!.clips.map(clip => (clip as { box: PipBox }).box);
  expect(boxes[0]).toEqual(pipGeometry('inset', portrait, landscape, {}, portrait).media);
  expect(boxes[1]).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  expect(boxes[2]).toEqual(pipGeometry('split', portrait, landscape, {}, portrait).media);
  // Under a fixed template, clips without their own layout follow it.
  const fixed = applyPipLayout(document as never, { template: 'dim' }, 'broll', { a: 'inset' }).timeline.tracks.find(track => track.id === 'broll')!.clips.map(clip => (clip as { box: PipBox }).box);
  expect(fixed[0]).toEqual(boxes[0]); expect(fixed[1]).toEqual(pipGeometry('dim', portrait, landscape).media);
});

it('offers full-screen footage per shot, not as a template', () => {
  expect(PIP_SHOT_LAYOUTS).toContain('full');
  expect(PIP_PICKER_TEMPLATES.map(template => template.id)).not.toContain('full');
  const full = pipGeometry('full', portrait, landscape, {}, portrait);
  expect(full.media).toEqual({ x: 0, y: 0, w: 1, h: 1 }); expect(full.speaker).toBeUndefined(); expect(full.mediaFit).toBe('cover'); expect(full.background).toBeUndefined();
});
