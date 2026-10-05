import { describe, expect, it } from 'vitest';
import { editPlanInput, PLATFORM_MOVES, playbookAgentBrief, playbookEditGuide, playbookEditParams, playbookHighlightsKeywords, punchInUpdates, titleTextItem, transitionItems, type PlanPick } from './brand-edit-params';
import { emptyPlaybook, playbookSnapshot, type BrandBlocks, type PlaybookSnapshot } from './brand-playbook';
import { buildCaptionBaseDocument, type CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition } from './workflow-caption-template';

const playbook = (blocks: BrandBlocks = {}): PlaybookSnapshot => ({ ...playbookSnapshot(emptyPlaybook('brand_1', 'Mine')), blocks });
const words = (start: number, texts: string[]) => texts.map((text, index) => ({ text, start: start + index * 0.5, end: start + index * 0.5 + 0.4 }));
// 20 s of speech with a pause cut out between 9 s and 10 s.
const document = () => buildCaptionBaseDocument({ projectId: 'p', sourceUrl: '', sourceSig: 's', width: 1080, height: 1920, durationSec: 20, transcript: [], cuts: [{ fromSec: 9, toSec: 10 }], options: { caption: {}, aspect: 'original', shortenPauses: true } });
const pick = (kind: PlanPick['kind'], sentenceIndex: number, wordIndex: number, variant: string, scale?: number): PlanPick => ({ kind, sentenceIndex, wordIndex, variant, ...(scale !== undefined ? { scale } : {}) });

describe('playbookEditParams', () => {
  it('runs the fixed blocks as parameters and offers the platform moves when the brand describes its editing', () => {
    expect(playbookEditParams(playbook({ sound: { pauses: 'tight', lufs: -15 }, editing: { text: '说到价格时快推近。' }, layout: { text: '顶部常驻标题栏。' } }))).toEqual({
      pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 },
      targetLufs: -15,
      moves: { punchIn: true, transition: true },
      titles: true,
    });
  });

  it('leaves out what the brand does not have', () => {
    expect(playbookEditParams(playbook())).toEqual({});
    expect(playbookEditParams(playbook({ editing: { text: '  ' } })).moves).toBeUndefined();
  });

  it('highlights key words when the captions do (on or off)', () => {
    expect(playbookHighlightsKeywords(playbook({ captions: { on: true, accent: 'keywords' } }))).toBe(true);
    expect(playbookHighlightsKeywords(playbook({ captions: { on: true, accent: null } }))).toBe(false);
  });
});

describe('edit planning', () => {
  it('gives the planner timeline times after the cuts and the platform moves with their ceiling', () => {
    const input = editPlanInput(document(), [
      { start: 1, end: 4, text: 'a b c', words: words(1, ['a', 'b', 'c']) },
      { start: 9.2, end: 9.8, text: 'cut out', words: words(9.2, ['cut', 'out']) },
      { start: 11, end: 15, text: 'd e', words: words(11, ['d', 'e']) },
    ], { punchIn: true, transition: true });
    expect(input.durationSec).toBe(19);
    expect(input.rows).toEqual([{ index: 0, text: 'a b c', startSec: 1 }, { index: 2, text: 'd e', startSec: 10 }]);
    expect(input.moves).toEqual([
      { kind: 'punch_in', variants: PLATFORM_MOVES.punch_in.variants, max: 2 },
      { kind: 'transition', variants: PLATFORM_MOVES.transition.variants, max: 1 },
    ]);
  });

  it('reads the brand as XML blocks: style, editing, structure, sound — no cover', () => {
    const guide = playbookEditGuide(playbook({ portrait: { text: '快节奏。' }, editing: { text: '说到价格推近。' }, cover: { design: '人物在右。' } }));
    expect(guide).toBe('<brand name="Mine">\n<portrait>\n快节奏。\n</portrait>\n<editing>\n说到价格推近。\n</editing>\n</brand>');
    expect(playbookAgentBrief(playbook({ cover: { frame: '惊讶表情。', headline: '一句反问。', design: '人物在右。' } }))).toContain('<cover>\n<frame>\n惊讶表情。\n</frame>\n<headline>\n一句反问。\n</headline>\n<design>\n人物在右。\n</design>\n</cover>');
    expect(playbookAgentBrief(playbook({ cover: { source: 'photo', design: '人物在左。' } }))).toContain('<cover person="a photo taken for covers">');
  });
});

describe('punchInUpdates', () => {
  it('zooms from the picked word to the sentence end, in the planned form and depth', () => {
    const transcript = [
      { start: 1, end: 4, text: 'a b c d e f', words: words(1, ['a', 'b', 'c', 'd', 'e', 'f']) },
      { start: 11, end: 15, text: 'g h i j', words: words(11, ['g', 'h', 'i', 'j']) },
    ];
    const updates = punchInUpdates(document(), transcript, [pick('punch_in', 0, 2, 'punch', 1.4), pick('punch_in', 1, 1, 'slow-push')]);
    expect(updates).toHaveLength(2);
    expect(updates[0]!.patch.properties!.zoom).toEqual({ preset: 'punch', atSec: 2, durationSec: 2, scale: 1.4 });
    // The second clip starts at 9 s on the timeline (source 10 s); "h" is at source 11.5 s; the preset's own depth.
    expect(updates[1]!.patch.properties!.zoom).toMatchObject({ preset: 'slow-push', atSec: 1.5, durationSec: 3.5, scale: 1.15 });
  });

  it('keeps the platform spacing, skips spans too short, ignores other moves and out-of-range depths', () => {
    const transcript = [
      { start: 1, end: 4, text: 'a b', words: words(1, ['a', 'b']) },
      { start: 3, end: 6, text: 'c d', words: words(3, ['c', 'd']) },
      { start: 18.6, end: 19, text: 'g', words: words(18.6, ['g']) },
    ];
    const updates = punchInUpdates(document(), transcript, [pick('punch_in', 0, 0, 'punch', 9), pick('punch_in', 1, 0, 'punch'), pick('punch_in', 2, 0, 'punch'), pick('transition', 1, 0, 'fade')]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.patch.properties!.zoom!.scale).toBe(1.25);
  });
});

describe('transitionItems', () => {
  it('puts each transition on the cut into its sentence, spaced by the platform ceiling, never at the very start', () => {
    const transcript = [
      { start: 0.2, end: 4, text: 'a b', words: words(0.2, ['a', 'b']) },
      { start: 11, end: 13, text: 'c d', words: words(11, ['c', 'd']) },
      { start: 14, end: 16, text: 'e f', words: words(14, ['e', 'f']) },
    ];
    const items = transitionItems(document(), transcript, [pick('transition', 0, 0, 'fade'), pick('transition', 1, 0, 'glitch'), pick('transition', 2, 0, 'fade')]);
    // Sentence 1 plays at 10 s on the cut timeline; sentence 2 at 13 s is closer than 60/3 = 20 s.
    expect(items).toEqual([{ atFrame: 300, effect: 'glitch' }]);
  });
});

describe('titleTextItem', () => {
  it('places a planned title as written: a plate becomes a label, otherwise plain text', () => {
    const canvas = { width: 1080, height: 1920, fps: 30 };
    const title = { text: '月薪三千怎么存钱', startSec: 0, durationSec: 30, box: { xPct: 5, yPct: 6, widthPct: 90, heightPct: 10 }, color: '#ffd600', plate: '#c8141e', sizePct: 4 };
    expect(titleTextItem('brand-title-1', title, canvas)).toMatchObject({ startFrame: 0, durationFrames: 900, preset: 'label', color: '#ffd600', accentColor: '#c8141e', fontSize: 77, placement: title.box });
    expect(titleTextItem('brand-title-2', { ...title, plate: null }, canvas)).toMatchObject({ preset: 'clean' });
  });
});

describe('captions workflow with brand edit parameters', () => {
  const options = (edit: CaptionTaskOptions['edit'], brand?: PlaybookSnapshot): CaptionTaskOptions => ({ caption: {}, aspect: 'original', shortenPauses: true, edit, ...(brand ? { brand } : {}) });
  const step = (definition: ReturnType<typeof captionWorkflowDefinition>, id: string) => definition.steps.find(item => item.id === id);

  it('passes the pause threshold, plans and places moves after captions, writes titles, and matches loudness before rendering', () => {
    const brand = playbook({ editing: { text: '说到价格推近。' }, layout: { text: '顶部常驻标题栏。' } });
    const definition = captionWorkflowDefinition(options({ pause: { minimumPauseSec: 0.25, speechPaddingSec: 0.08 }, targetLufs: -15, moves: { punchIn: true }, titles: true }, brand), { sig: 'm' });
    expect(Object.keys(step(definition, 'pauses')!.arguments)).toEqual(expect.arrayContaining(['minimumPauseSec', 'speechPaddingSec']));
    expect(definition.steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'editplan', 'moves', 'titles', 'texts', 'loudness', 'render']);
    expect(step(definition, 'moves')!.arguments.picks).toEqual({ kind: 'step', stepId: 'editplan', key: 'picks' });
  });

  it('adds nothing when the options carry no edit parameters, and no titles without a layout block', () => {
    expect(captionWorkflowDefinition(options(undefined), { sig: 'm' }).steps.map(item => item.id)).toEqual(['transcript', 'pauses', 'compose', 'plan', 'captions', 'render']);
    expect(captionWorkflowDefinition(options({ titles: true }, playbook()), { sig: 'm' }).steps.map(item => item.id)).not.toContain('titles');
  });
});
