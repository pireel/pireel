import { describe, expect, it } from 'vitest';
import {
  applyOverlayDocumentEdits,
  compositionToEditorDocument,
  projectDocumentToComposition,
  type Composition,
} from '@pireel/studio-engine/composition';
import {
  blockPatchableChange,
  canApplyBlockPatchInPlace,
  nativeMediaBoxOnlyChange,
  sameExceptCapStyle,
  shotFramingOnlyChange,
  supplementalMediaFramingOnlyChange,
} from './comp-diff';

const base = (): Composition => ({
  width: 1080,
  height: 1920,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }],
});

describe('shotFramingOnlyChange', () => {
  it('preciseFraming takes the live preview/timeline fast path', () => {
    const a = base();
    const b = { ...a, shots: [{ ...a.shots![0]!, preciseFraming: { scale: 2, anchorX: 0.3, anchorY: 0.4 } }] };
    expect(shotFramingOnlyChange(a, b)).toBe(true);
  });

  it('does not classify a value-identical V2 projection as a framing edit', () => {
    const document = compositionToEditorDocument({ projectId: 'projection-noop', composition: base() }).document;
    expect(shotFramingOnlyChange(projectDocumentToComposition(document), projectDocumentToComposition(document))).toBe(false);
  });
});

describe('sameExceptCapStyle', () => {
  it('requires the caption style to actually change', () => {
    const document = compositionToEditorDocument({ projectId: 'projection-caption-noop', composition: base() }).document;
    expect(sameExceptCapStyle(projectDocumentToComposition(document), projectDocumentToComposition(document))).toBe(false);
  });
});

describe('nativeMediaBoxOnlyChange', () => {
  it('keeps primary-video move/resize commits off the iframe rebuild path', () => {
    const before = base();
    const after = { ...before, shots: [{ ...before.shots![0]!, box: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 } }] };
    expect(nativeMediaBoxOnlyChange(
      before,
      after,
      { videoPlacements: [{ shotId: 's1', startSec: 0, endSec: 3 }], supplementalVisuals: [] },
      { videoPlacements: [{ shotId: 's1', startSec: 0, endSec: 3, box: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 } }], supplementalVisuals: [] },
    )).toBe(true);
  });

  it('keeps a static supplemental-video box commit off the iframe rebuild path', () => {
    const visual = {
      clipId: 'v1', trackId: 'visual-1', stackOrder: 1, kind: 'video' as const,
      source: 'video.mp4', startSec: 0, endSec: 3, sourceInSec: 0, sourceOutSec: 3,
      fit: 'contain' as const, muted: false,
    };
    expect(nativeMediaBoxOnlyChange(
      base(),
      base(),
      { videoPlacements: [], supplementalVisuals: [visual] },
      { videoPlacements: [], supplementalVisuals: [{ ...visual, box: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } }] },
    )).toBe(true);
  });

  it('rejects structural edits and animated media boxes', () => {
    const before = base();
    const after = { ...before, width: 720 };
    expect(nativeMediaBoxOnlyChange(
      before,
      after,
      { videoPlacements: [{ shotId: 's1', startSec: 0, endSec: 3 }], supplementalVisuals: [] },
      { videoPlacements: [{ shotId: 's1', startSec: 0, endSec: 3, box: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }], supplementalVisuals: [] },
    )).toBe(false);

    const animated = {
      clipId: 'v1', trackId: 'visual-1', stackOrder: 1, kind: 'video' as const,
      source: 'video.mp4', startSec: 0, endSec: 3, sourceInSec: 0, sourceOutSec: 3,
      fit: 'contain' as const, muted: false,
      keyframes: { box: [{ atSec: 1, x: 0.1, y: 0.1, w: 0.8, h: 0.8 }] },
    };
    expect(nativeMediaBoxOnlyChange(
      before,
      before,
      { videoPlacements: [], supplementalVisuals: [animated] },
      { videoPlacements: [], supplementalVisuals: [{ ...animated, box: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 } }] },
    )).toBe(false);
  });
});

describe('supplementalMediaFramingOnlyChange', () => {
  const visual = {
    clipId: 'v1', trackId: 'visual-1', stackOrder: 1, kind: 'video' as const,
    source: 'video.mp4', startSec: 0, endSec: 3, sourceInSec: 0, sourceOutSec: 3,
    fit: 'contain' as const, muted: false,
  };

  it('keeps an ordinary media transform/crop commit off the iframe rebuild path', () => {
    const mediaFraming = {
      transform: { scale: 1.4, offsetX: 0.12, offsetY: -0.08 },
      crop: { top: 0.1, right: 0.05, bottom: 0, left: 0.05 },
      rounding: 0.03,
    };
    expect(supplementalMediaFramingOnlyChange(
      base(),
      base(),
      { videoPlacements: [], supplementalVisuals: [visual] },
      { videoPlacements: [], supplementalVisuals: [{ ...visual, mediaFraming }] },
    )).toBe(true);
  });

  it('rejects a framing update combined with another media or composition edit', () => {
    const framed = {
      ...visual,
      mediaFraming: {
        transform: { scale: 1.2, offsetX: 0, offsetY: 0 },
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
        rounding: 0,
      },
    };
    expect(supplementalMediaFramingOnlyChange(
      base(),
      base(),
      { videoPlacements: [], supplementalVisuals: [visual] },
      { videoPlacements: [], supplementalVisuals: [{ ...framed, source: 'other.mp4' }] },
    )).toBe(false);
    expect(supplementalMediaFramingOnlyChange(
      base(),
      { ...base(), width: 720 },
      { videoPlacements: [], supplementalVisuals: [visual] },
      { videoPlacements: [], supplementalVisuals: [framed] },
    )).toBe(false);
  });
});

describe('blockPatchableChange', () => {
  it('keeps fitScale-only resize settlement on the in-place path', () => {
    const a = { ...base(), blocks: [{ id: 'b1', templateId: 'custom', slots: { innerHtml: '<b>x</b>' }, startSec: 0, durationSec: 2, trackIndex: 2, box: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 } }] };
    const b = { ...a, blocks: [{ ...a.blocks[0]!, fitScale: 0.92 }] };
    expect(blockPatchableChange(a, b)).toEqual({ pairs: [], removed: [], added: [] });
  });

  it('recognizes one custom-component update across real V2 projections', () => {
    const source: Composition = {
      ...base(),
      video: { url: 'https://example.com/source.mp4', durationSec: 3 },
      blocks: [
        {
          id: 'b1',
          templateId: 'custom',
          slots: { innerHtml: '<b>before</b>', timelineBody: '' },
          startSec: 0,
          durationSec: 2,
          trackIndex: 2,
          box: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
        },
        {
          id: 'b2',
          templateId: 'custom',
          slots: { innerHtml: '<i>unchanged</i>', timelineBody: '' },
          startSec: 0,
          durationSec: 2,
          trackIndex: 3,
          box: { x: 0.2, y: 0.3, w: 0.3, h: 0.2 },
        },
      ],
    };
    const document = compositionToEditorDocument({ projectId: 'projection-patch', composition: source }).document;
    const before = projectDocumentToComposition(document);
    const edit = applyOverlayDocumentEdits({
      document,
      updates: [{ clipId: 'b1', block: { slots: { innerHtml: '<b>after</b>', timelineBody: '' } } }],
    });
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const after = projectDocumentToComposition(edit.document);

    // The V2 adapter recreates these compatibility objects on every projection. Their values did
    // not change, so they must not force a full preview-document rebuild.
    expect(after.shots).not.toBe(before.shots);
    const patch = blockPatchableChange(before, after);
    expect(patch).not.toBeNull();
    expect(patch?.pairs).toHaveLength(1);
    expect(patch?.pairs[0]).toMatchObject({ a: { id: 'b1' }, b: { id: 'b1' }, slots: true });
    expect(patch?.added).toEqual([]);
    expect(patch?.removed).toEqual([]);
  });

  it('recognizes one kit props update across real V2 projections', () => {
    const source: Composition = {
      ...base(),
      blocks: [{
        id: 'kit1',
        templateId: 'kit:stat',
        slots: { props: { value: '42', label: 'Before' } },
        startSec: 0,
        durationSec: 2,
        trackIndex: 2,
        box: { x: 0.1, y: 0.1, w: 0.4, h: 0.2 },
      }],
    };
    const document = compositionToEditorDocument({ projectId: 'projection-kit-patch', composition: source }).document;
    const before = projectDocumentToComposition(document);
    const edit = applyOverlayDocumentEdits({
      document,
      updates: [{ clipId: 'kit1', block: { slots: { props: { value: '43', label: 'After' } } } }],
    });
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const patch = blockPatchableChange(before, projectDocumentToComposition(edit.document));

    expect(patch?.pairs).toHaveLength(1);
    expect(patch?.pairs[0]).toMatchObject({ a: { id: 'kit1' }, b: { id: 'kit1' }, kitProps: true });
  });

  it('classifies a media animation edit as a timeline-only patch', () => {
    const media = {
      id: 'sticker',
      templateId: 'media',
      slots: { media: { type: 'image', url: 'https://example.com/sticker.png' } },
      startSec: 0,
      durationSec: 2,
      trackIndex: 2,
      box: { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
    };
    const before = { ...base(), blocks: [media] };
    const after = {
      ...before,
      blocks: [{ ...media, slots: { ...media.slots, anim: { enter: 'scale', exit: 'fade', dur: 0.5 } } }],
    };

    expect(blockPatchableChange(before, after)?.pairs[0]).toMatchObject({
      a: { id: 'sticker' },
      b: { id: 'sticker' },
      mediaTimeline: true,
      slots: false,
      replace: false,
    });
  });

  it('keeps existing-node replacements in place on layered canvases', () => {
    const a = {
      ...base(),
      blocks: [{
        id: 'b1',
        templateId: 'custom',
        slots: { innerHtml: '<b>before</b>', timelineBody: '' },
        startSec: 0,
        durationSec: 2,
        trackIndex: 2,
      }],
    };
    const b = {
      ...a,
      blocks: [{ ...a.blocks[0]!, slots: { innerHtml: '<b>after</b>', timelineBody: '' } }],
    };
    const patch = blockPatchableChange(a, b);
    expect(patch).not.toBeNull();
    expect(canApplyBlockPatchInPlace(patch!, { hasSupplementalVisuals: true, hasPersonMatte: true })).toBe(true);
  });

  it('keeps layered-canvas additions on the full rebuild path', () => {
    const a = base();
    const b = {
      ...a,
      blocks: [{
        id: 'b1',
        templateId: 'custom',
        slots: { innerHtml: '<b>new</b>', timelineBody: '' },
        startSec: 0,
        durationSec: 2,
        trackIndex: 2,
      }],
    };
    const patch = blockPatchableChange(a, b);
    expect(patch).not.toBeNull();
    expect(canApplyBlockPatchInPlace(patch!, { hasSupplementalVisuals: true, hasPersonMatte: false })).toBe(false);
    expect(canApplyBlockPatchInPlace(patch!, { hasSupplementalVisuals: false, hasPersonMatte: true })).toBe(false);
    expect(canApplyBlockPatchInPlace(patch!, { hasSupplementalVisuals: false, hasPersonMatte: false })).toBe(true);
  });
});
