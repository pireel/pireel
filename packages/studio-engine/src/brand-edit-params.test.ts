import { describe, expect, it } from 'vitest';
import { bandCapacity, templateTextItem, brandAgentBrief, brandEditGuide, brandEditParams, brandHighlightsKeywords, editPlanInput, punchInUpdates } from './brand-edit-params';
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

describe('edit planning', () => {
  const document = () => buildCaptionBaseDocument({ projectId: 'p', sourceUrl: '', sourceSig: 's', width: 1080, height: 1920, durationSec: 20, transcript: [], cuts: [{ fromSec: 9, toSec: 10 }], options: { caption: {}, aspect: 'original', shortenPauses: true } });
  const words = (start: number, texts: string[]) => texts.map((text, index) => ({ text, start: start + index * 0.5, end: start + index * 0.5 + 0.4 }));

  it('gives the planner timeline times after the cuts and a count the spacing allows', () => {
    const input = editPlanInput(document(), [
      { start: 1, end: 4, text: 'a b c', words: words(1, ['a', 'b', 'c']) },
      { start: 9.2, end: 9.8, text: 'cut out', words: words(9.2, ['cut', 'out']) },
      { start: 11, end: 15, text: 'd e', words: words(11, ['d', 'e']) },
    ], { preset: 'punch', scale: 1.2, minGapSec: 8 });
    expect(input.durationSec).toBe(19);
    expect(input.maxPunches).toBe(2);
    expect(input.rows).toEqual([{ index: 0, text: 'a b c', startSec: 1 }, { index: 2, text: 'd e', startSec: 10 }]);
  });

  it('punches in on the planned words instead of highlights', () => {
    const transcript = [{ start: 1, end: 4, text: 'a b c d', words: words(1, ['a', 'b', 'c', 'd']), wordDecorations: { '0': { highlight: 'color' as const } } }];
    const updates = punchInUpdates(document(), transcript, { preset: 'punch', scale: 1.2, minGapSec: 3 }, [{ sentenceIndex: 0, wordIndex: 2 }]);
    expect(updates[0]!.patch.properties!.zoom).toMatchObject({ atSec: 2 });
  });

  it('hands the planner the brand rules that decide cuts', () => {
    const style = { version: 1, summary: '', summaryEn: 'Fast unboxing talk.', frames: [], systems: Object.fromEntries(['captions', 'typography', 'graphics', 'color', 'framing', 'editing', 'motion', 'bookends', 'sound', 'cover'].map(id => [id, { present: id === 'editing', summary: '', rules: id === 'editing' ? [{ text: '笑点推近', en: 'Punch in on punchlines.', videos: [], evidence: [] }] : [], tokens: {}, variations: '', confidence: 'high' }])) } as unknown as BrandSnapshot['style'];
    expect(brandEditGuide(brand({ style }))).toBe('Fast unboxing talk.\nediting:\n- Punch in on punchlines.');
    expect(brandEditGuide(brand())).toBe('');
  });
});

describe('brandAgentBrief', () => {
  it('gives the agent the measured habits and assets, and nothing invented for a blank brand', () => {
    const full = { ...spec({ mode: 'aggressive', lufs: -15.3 }), cutting: { ...spec().cutting, targetCpm: field([15.4, 25.6]) }, captions: { presence: field('always'), wordsPerPage: field(2), case: field('sentence') }, framing: { faceH: field(0.28) }, layout: null } as unknown as BrandEditSpec;
    const brief = brandAgentBrief(brand({ spec: full, logo: { key: 'k', kind: 'image', width: 1, height: 1, corner: 'top-right', widthPct: 10, opacity: 1 } }));
    expect(brief).toContain('cutting 15–26 cuts/min; pauses tight — even breaths are cut; loudness about -15 LUFS; captions ~2 words on screen; face about 28% of frame height.');
    expect(brief).toContain('Brand assets: logo.');
    expect(brandAgentBrief(brand())).toBe('Brand assets: none.');
  });
});

describe('captions workflow with brand edit parameters', () => {
  const options = (edit: CaptionTaskOptions['edit'], highlights = false): CaptionTaskOptions => ({ caption: {}, aspect: 'original', shortenPauses: true, highlights, edit });
  const step = (definition: ReturnType<typeof captionWorkflowDefinition>, id: string) => definition.steps.find(item => item.id === id);

  it('passes the pause threshold, punches in after captions and matches loudness before rendering', () => {
    const definition = captionWorkflowDefinition(options({ pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 }, targetLufs: -15, punchIn: { preset: 'punch', scale: 1.2, minGapSec: 8 } }), { sig: 'm' });
    expect(Object.keys(step(definition, 'pauses')!.arguments)).toEqual(expect.arrayContaining(['minimumPauseSec', 'speechPaddingSec']));
    expect(definition.steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'editplan', 'punch', 'loudness', 'render']);
    // The plan decides the punch-ins; key words are only coloured when captions ask for them.
    expect(step(definition, 'punch')!.arguments.targets).toEqual({ kind: 'step', stepId: 'editplan', key: 'targets' });
  });

  it('adds nothing when the options carry no edit parameters', () => {
    expect(captionWorkflowDefinition(options(undefined), { sig: 'm' }).steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'render']);
  });
});

describe('brand text bands', () => {
  const header = { box: { x: 0.05, y: 0.06, w: 0.9, h: 0.05 }, color: '#ffd600', plate: '#c8141e', sizePct: 0.05 };
  const label = { ...header, box: { x: 0.1, y: 0.3, w: 0.8, h: 0.04 }, plate: null, sizePct: 0.04, durationSec: 3 };

  it('turns the brand templates into switches for a one-click edit', () => {
    expect(brandEditParams(brand({ templates: { header, hookLabel: label } })).texts).toEqual({ header: true, hookLabel: true });
    expect(brandEditParams(brand()).texts).toBeUndefined();
  });

  it('sizes the text from the measured band and styles a plate as a label', () => {
    const canvas = { width: 1080, height: 1920, fps: 30 };
    expect(bandCapacity(header, canvas, 2)).toEqual({ fontSize: 82, maxChars: 22 });
    expect(templateTextItem('brand-header', '月薪三千怎么存钱', header, canvas, 0, 30, 2)).toMatchObject({
      startFrame: 0, durationFrames: 900, preset: 'label', color: '#ffd600', accentColor: '#c8141e', fontSize: 82, placement: { xPct: 5, yPct: 6, widthPct: 90, heightPct: 10 },
    });
    expect(templateTextItem('brand-hook-label', 'x', label, canvas, 0, 3, 1)).toMatchObject({ preset: 'clean' });
  });

  it('writes the band words and applies them after captions, before the brand intro', () => {
    const options: CaptionTaskOptions = { caption: {}, aspect: 'original', shortenPauses: false, edit: { texts: { header: true } }, brand: brand({ templates: { header } }) };
    const ids = captionWorkflowDefinition(options, { sig: 'm' }).steps.map(item => item.id);
    expect(ids).toEqual(['transcript', 'compose', 'plan', 'captions', 'copy', 'texts', 'render']);
  });
});
