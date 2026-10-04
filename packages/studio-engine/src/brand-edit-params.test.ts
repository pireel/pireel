import { describe, expect, it } from 'vitest';
import { bandCapacity, bandTextItem, editPlanInput, playbookAgentBrief, playbookEditGuide, playbookEditParams, playbookHighlightsKeywords, punchInUpdates, transitionItems, type PlanPick } from './brand-edit-params';
import { emptyPlaybook, playbookSnapshot, type Move, type PlaybookSnapshot } from './brand-playbook';
import { buildCaptionBaseDocument, type CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition } from './workflow-caption-template';

const playbook = (patch: Partial<PlaybookSnapshot> = {}): PlaybookSnapshot => ({ ...playbookSnapshot(emptyPlaybook('brand_1', 'Mine')), ...patch });
const move = (patch: Partial<Move> & Pick<Move, 'kind' | 'variants'>): Move => ({ frequency: 'moderate', maxPerMin: 2, trigger: { text: '说到结论时', en: 'On a conclusion.' }, ...patch });
const words = (start: number, texts: string[]) => texts.map((text, index) => ({ text, start: start + index * 0.5, end: start + index * 0.5 + 0.4 }));
// 20 s of speech with a pause cut out between 9 s and 10 s.
const document = () => buildCaptionBaseDocument({ projectId: 'p', sourceUrl: '', sourceSig: 's', width: 1080, height: 1920, durationSec: 20, transcript: [], cuts: [{ fromSec: 9, toSec: 10 }], options: { caption: {}, aspect: 'original', shortenPauses: true } });
const pick = (kind: PlanPick['kind'], sentenceIndex: number, wordIndex: number, variant: string): PlanPick => ({ kind, sentenceIndex, wordIndex, variant });

describe('playbookEditParams', () => {
  it('runs fixed habits as parameters and offers the moves the engine can place', () => {
    const params = playbookEditParams(playbook({
      fixed: { pauses: { mode: 'tight' }, loudness: { lufs: -15 } },
      moves: [
        move({ kind: 'punch_in', variants: ['punch', 'slow-push'], maxPerMin: 2, settings: { scale: 1.35 } }),
        move({ kind: 'transition', variants: ['whip', 'sfx_hit', 'flash'], frequency: 'rare', maxPerMin: 1 }),
        move({ kind: 'broll', variants: ['product'] }),
      ],
    }));
    expect(params).toEqual({
      pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
      targetLufs: -15,
      moves: { punchIn: { variants: ['punch', 'slow-push'], scale: 1.35, maxPerMin: 2 }, transition: { variants: ['directional', 'fadeblack'], maxPerMin: 1 } },
    });
  });

  it('leaves out what the playbook does not have, and a transition with no picture effect', () => {
    expect(playbookEditParams(playbook())).toEqual({});
    expect(playbookEditParams(playbook({ moves: [move({ kind: 'transition', variants: ['sfx_hit'] })] })).moves).toBeUndefined();
  });

  it('marks key words only when the captions do', () => {
    expect(playbookHighlightsKeywords(playbook({ fixed: { captions: { on: true, accent: 'keywords' } } }))).toBe(true);
    expect(playbookHighlightsKeywords(playbook({ fixed: { captions: { on: true, accent: 'current_word' } } }))).toBe(false);
  });
});

describe('edit planning', () => {
  it('gives the planner timeline times after the cuts and each move its cap over this length', () => {
    const input = editPlanInput(document(), [
      { start: 1, end: 4, text: 'a b c', words: words(1, ['a', 'b', 'c']) },
      { start: 9.2, end: 9.8, text: 'cut out', words: words(9.2, ['cut', 'out']) },
      { start: 11, end: 15, text: 'd e', words: words(11, ['d', 'e']) },
    ], { punchIn: { variants: ['punch'], scale: 1.2, maxPerMin: 6 }, transition: { variants: ['fade'], maxPerMin: 1 } });
    expect(input.durationSec).toBe(19);
    expect(input.rows).toEqual([{ index: 0, text: 'a b c', startSec: 1 }, { index: 2, text: 'd e', startSec: 10 }]);
    // A cap never rounds a move away: a short video still allows one.
    expect(input.moves).toEqual([{ kind: 'punch_in', variants: ['punch'], max: 1 }, { kind: 'transition', variants: ['fade'], max: 1 }]);
  });

  it('reads the triggers and structure, not the variant list', () => {
    const guide = playbookEditGuide(playbook({ portrait: { text: '', en: 'Fast unboxing talk.' }, moves: [move({ kind: 'punch_in', variants: ['punch'] })], structure: { closing: { text: '', en: 'Ends on a question.' }, rules: [] } }));
    expect(guide).toBe('Fast unboxing talk.\npunch_in (moderate): On a conclusion.\nclosing: Ends on a question.');
  });
});

describe('punchInUpdates', () => {
  const punch = { variants: ['punch', 'slow-push'] as const, scale: 1.2, maxPerMin: 20 };

  it('zooms from the picked word to the sentence end in the clip that holds it, in the picked variant', () => {
    const transcript = [
      { start: 1, end: 4, text: 'a b c d e f', words: words(1, ['a', 'b', 'c', 'd', 'e', 'f']) },
      { start: 11, end: 15, text: 'g h i j', words: words(11, ['g', 'h', 'i', 'j']) },
    ];
    const updates = punchInUpdates(document(), transcript, { ...punch, variants: [...punch.variants] }, [pick('punch_in', 0, 2, 'punch'), pick('punch_in', 1, 1, 'slow-push')]);
    expect(updates).toHaveLength(2);
    expect(updates[0]!.patch.properties!.zoom).toEqual({ preset: 'punch', atSec: 2, durationSec: 2, scale: 1.2 });
    // The second clip starts at 9 s on the timeline (source 10 s); "h" is at source 11.5 s.
    expect(updates[1]!.patch.properties!.zoom).toMatchObject({ preset: 'slow-push', atSec: 1.5, durationSec: 3.5 });
  });

  it('keeps the spacing the cap allows, skips spans too short, and ignores other moves', () => {
    const transcript = [
      { start: 1, end: 4, text: 'a b', words: words(1, ['a', 'b']) },
      { start: 12, end: 14, text: 'c d', words: words(12, ['c', 'd']) },
      { start: 18.6, end: 19, text: 'g', words: words(18.6, ['g']) },
    ];
    const updates = punchInUpdates(document(), transcript, { variants: ['punch'], scale: 1.2, maxPerMin: 3 }, [pick('punch_in', 0, 0, 'punch'), pick('punch_in', 1, 0, 'punch'), pick('punch_in', 2, 0, 'punch'), pick('transition', 1, 0, 'fade')]);
    expect(updates).toHaveLength(1);
  });

  it('falls back to the first allowed variant when the plan names another', () => {
    const transcript = [{ start: 1, end: 4, text: 'a b c', words: words(1, ['a', 'b', 'c']) }];
    expect(punchInUpdates(document(), transcript, { variants: ['instant'], scale: 1.2, maxPerMin: 2 }, [pick('punch_in', 0, 0, 'punch')])[0]!.patch.properties!.zoom!.preset).toBe('instant');
  });
});

describe('transitionItems', () => {
  it('puts each accent on the cut into its sentence, spaced by the cap, never at the very start', () => {
    const transcript = [
      { start: 0.2, end: 4, text: 'a b', words: words(0.2, ['a', 'b']) },
      { start: 11, end: 13, text: 'c d', words: words(11, ['c', 'd']) },
      { start: 14, end: 16, text: 'e f', words: words(14, ['e', 'f']) },
    ];
    const items = transitionItems(document(), transcript, { variants: ['fade', 'glitch'], maxPerMin: 6 }, [pick('transition', 0, 0, 'fade'), pick('transition', 1, 0, 'glitch'), pick('transition', 2, 0, 'fade')]);
    // Sentence 1 plays at 10 s on the cut timeline; sentence 2 at 13 s is closer than 60/6 = 10 s.
    expect(items).toEqual([{ atFrame: 300, effect: 'glitch' }]);
  });
});

describe('playbookAgentBrief', () => {
  it('gives the agent the style, fixed habits, moves and structure, and nothing for a blank brand', () => {
    const brief = playbookAgentBrief(playbook({
      portrait: { text: '', en: 'Quick tech reviews.' },
      fixed: { captions: { on: true, perScreen: 8, accent: 'keywords' }, pauses: { mode: 'tight' }, logo: { key: 'k', kind: 'image', width: 1, height: 1, corner: 'top-right', widthPct: 10, opacity: 1 } },
      moves: [move({ kind: 'punch_in', variants: ['punch'], frequency: 'frequent' })],
      structure: { pace: { cutsPerMin: [15, 26] }, rules: [] },
    }));
    expect(brief).toContain('Style: Quick tech reviews.');
    expect(brief).toContain('Fixed habits: captions on, ~8 per screen, keywords marked; pauses tight; logo.');
    expect(brief).toContain('- punch_in [punch, frequent]: On a conclusion.');
    expect(brief).toContain('Body pace: 15–26 cuts per minute.');
    expect(playbookAgentBrief(playbook())).toBe('');
  });
});

describe('captions workflow with playbook edit parameters', () => {
  const options = (edit: CaptionTaskOptions['edit'], brand?: PlaybookSnapshot): CaptionTaskOptions => ({ caption: {}, aspect: 'original', shortenPauses: true, edit, ...(brand ? { brand } : {}) });
  const step = (definition: ReturnType<typeof captionWorkflowDefinition>, id: string) => definition.steps.find(item => item.id === id);

  it('passes the pause threshold, plans and places moves after captions, and matches loudness before rendering', () => {
    const brand = playbook({ moves: [move({ kind: 'punch_in', variants: ['punch'] })] });
    const definition = captionWorkflowDefinition(options({ pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 }, targetLufs: -15, moves: { punchIn: { variants: ['punch'], scale: 1.2, maxPerMin: 2 } } }, brand), { sig: 'm' });
    expect(Object.keys(step(definition, 'pauses')!.arguments)).toEqual(expect.arrayContaining(['minimumPauseSec', 'speechPaddingSec']));
    expect(definition.steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'editplan', 'moves', 'loudness', 'render']);
    expect(step(definition, 'moves')!.arguments.picks).toEqual({ kind: 'step', stepId: 'editplan', key: 'picks' });
  });

  it('adds nothing when the options carry no edit parameters', () => {
    expect(captionWorkflowDefinition(options(undefined), { sig: 'm' }).steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'render']);
  });
});

describe('brand text bands', () => {
  const header = { box: { x: 0.05, y: 0.06, w: 0.9, h: 0.05 }, color: '#ffd600', plate: '#c8141e', sizePct: 0.05 };
  const label = { ...header, box: { x: 0.1, y: 0.3, w: 0.8, h: 0.04 }, plate: null, sizePct: 0.04, durationSec: 3 };

  it('turns the playbook bands into switches for a one-click edit', () => {
    expect(playbookEditParams(playbook({ fixed: { bands: { header, hookLabel: label } } })).texts).toEqual({ header: true, hookLabel: true });
    expect(playbookEditParams(playbook()).texts).toBeUndefined();
  });

  it('sizes the text from the measured band and styles a plate as a label', () => {
    const canvas = { width: 1080, height: 1920, fps: 30 };
    expect(bandCapacity(header, canvas, 2)).toEqual({ fontSize: 82, maxChars: 22 });
    expect(bandTextItem('brand-header', '月薪三千怎么存钱', header, canvas, 0, 30, 2)).toMatchObject({
      startFrame: 0, durationFrames: 900, preset: 'label', color: '#ffd600', accentColor: '#c8141e', fontSize: 82, placement: { xPct: 5, yPct: 6, widthPct: 90, heightPct: 10 },
    });
    expect(bandTextItem('brand-hook-label', 'x', label, canvas, 0, 3, 1)).toMatchObject({ preset: 'clean' });
  });

  it('writes the band words and applies them after captions', () => {
    const options: CaptionTaskOptions = { caption: {}, aspect: 'original', shortenPauses: false, edit: { texts: { header: true } }, brand: playbook({ fixed: { bands: { header } } }) };
    expect(captionWorkflowDefinition(options, { sig: 'm' }).steps.map(item => item.id)).toEqual(['transcript', 'compose', 'plan', 'captions', 'copy', 'texts', 'render']);
  });
});
