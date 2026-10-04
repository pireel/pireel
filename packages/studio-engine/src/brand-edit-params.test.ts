import { describe, expect, it } from 'vitest';
import { brandEditParams, brandHighlightsKeywords, punchInUpdates } from './brand-edit-params';
import { brandSnapshot, emptyBrandKit, type BrandSnapshot } from './brand-kit';
import type { BrandEditSpec } from './brand-edit-spec';
import { buildCaptionBaseDocument, type CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition } from './workflow-caption-template';
import type { AsrSegment } from './build-blocks';

const field = <T>(value: T, confidence = 0.8) => ({ value, provenance: { source: 'measured' as const, confidence, videos: 5 } });
/** Only the fields a one-click edit reads. */
const spec = (patch: { mode?: 'aggressive' | 'moderate' | 'natural'; lufs?: number; punch?: boolean; accent?: string } = {}) => ({
  cutting: { silence: field({ mode: patch.mode ?? 'aggressive', maxGapMs: 200 }), ...(patch.punch !== undefined ? { punchIn: field({ enabled: patch.punch }) } : {}) },
  audio: { targetLufs: field(patch.lufs ?? -14.8) },
  captions: { ...(patch.accent ? { accentRule: field(patch.accent) } : {}) },
}) as unknown as BrandEditSpec;
const brand = (patch: Partial<BrandSnapshot> = {}): BrandSnapshot => ({ ...brandSnapshot(emptyBrandKit('brand_1', 'Mine')), ...patch });

describe('brandEditParams', () => {
  it('turns the measured habits into executable parameters', () => {
    expect(brandEditParams(brand({ spec: spec({ mode: 'aggressive', lufs: -14.8, punch: true }) }))).toEqual({
      pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
      targetLufs: -15,
      punchIn: { preset: 'punch', scale: 1.2, minGapSec: 8 },
    });
  });

  it('reads a set zoom as a trigger with a minimum spacing, not a rate', () => {
    const params = brandEditParams(brand({ pacing: { zoom: { preset: 'instant', everySec: 1 }, trimSilence: true } }));
    expect(params.punchIn).toEqual({ preset: 'instant', scale: 1.25, minGapSec: 3 });
    // No measurements: pauses and loudness stay with the scene's defaults.
    expect(params.pause).toBeUndefined();
    expect(params.targetLufs).toBeUndefined();
  });

  it('keeps loudness inside a sane range and marks key words only when the brand does', () => {
    expect(brandEditParams(brand({ spec: spec({ lufs: -3 }) })).targetLufs).toBe(-9);
    expect(brandHighlightsKeywords(brand({ spec: spec({ accent: 'keywords' }) }))).toBe(true);
    expect(brandHighlightsKeywords(brand({ spec: spec({ accent: 'current_word' }) }))).toBe(false);
  });
});

describe('punchInUpdates', () => {
  const words = (start: number, texts: string[]) => texts.map((text, index) => ({ text, start: start + index * 0.5, end: start + index * 0.5 + 0.4 }));
  // 20 s of speech with a pause cut out between 9 s and 10 s.
  const document = () => buildCaptionBaseDocument({ projectId: 'p', sourceUrl: '', sourceSig: 's', width: 1080, height: 1920, durationSec: 20, transcript: [], cuts: [{ fromSec: 9, toSec: 10 }], options: { caption: {}, aspect: 'original', shortenPauses: true } });
  const highlighted = (segment: AsrSegment, index: number): AsrSegment => ({ ...segment, wordDecorations: { [String(index)]: { highlight: 'color' } } });

  it('pushes in from the key word to the sentence end inside the clip that holds it', () => {
    const transcript = [
      highlighted({ start: 1, end: 4, text: 'a b c d e f', words: words(1, ['a', 'b', 'c', 'd', 'e', 'f']) }, 2),
      highlighted({ start: 11, end: 15, text: 'g h i j', words: words(11, ['g', 'h', 'i', 'j']) }, 1),
    ];
    const updates = punchInUpdates(document(), transcript, { preset: 'punch', scale: 1.2, minGapSec: 3 });
    expect(updates).toHaveLength(2);
    expect(updates[0]!.patch.properties!.zoom).toEqual({ preset: 'punch', atSec: 2, durationSec: 2, scale: 1.2 });
    // The second clip starts at 9 s on the timeline (source 10 s); "h" is at source 11.5 s.
    expect(updates[1]!.patch.properties!.zoom).toMatchObject({ atSec: 1.5, durationSec: 3.5 });
  });

  it('keeps the minimum spacing and skips sentences without a key word or too short a span', () => {
    const transcript = [
      highlighted({ start: 1, end: 4, text: 'a b', words: words(1, ['a', 'b']) }, 0),
      highlighted({ start: 12, end: 14, text: 'c d', words: words(12, ['c', 'd']) }, 0),
      { start: 15, end: 18, text: 'e f', words: words(15, ['e', 'f']) },
      highlighted({ start: 18.6, end: 19, text: 'g', words: words(18.6, ['g']) }, 0),
    ];
    const updates = punchInUpdates(document(), transcript, { preset: 'punch', scale: 1.2, minGapSec: 20 });
    expect(updates).toHaveLength(1);
  });
});

describe('captions workflow with brand edit parameters', () => {
  const options = (edit: CaptionTaskOptions['edit'], highlights = false): CaptionTaskOptions => ({ caption: {}, aspect: 'original', shortenPauses: true, highlights, edit });
  const step = (definition: ReturnType<typeof captionWorkflowDefinition>, id: string) => definition.steps.find(item => item.id === id);

  it('passes the pause threshold, punches in after captions and matches loudness before rendering', () => {
    const definition = captionWorkflowDefinition(options({ pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 }, targetLufs: -15, punchIn: { preset: 'punch', scale: 1.2, minGapSec: 8 } }), { sig: 'm' });
    expect(Object.keys(step(definition, 'pauses')!.arguments)).toEqual(expect.arrayContaining(['minimumPauseSec', 'speechPaddingSec']));
    expect(definition.steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'highlight', 'plan', 'captions', 'punch', 'loudness', 'render']);
    // Key words are found for the punch-ins, but captions only colour them when asked.
    expect(step(definition, 'plan')!.arguments.transcript).toEqual({ kind: 'step', stepId: 'transcript', key: 'transcript' });
  });

  it('adds nothing when the options carry no edit parameters', () => {
    expect(captionWorkflowDefinition(options(undefined), { sig: 'm' }).steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'render']);
  });
});
