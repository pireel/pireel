import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot, validatePlaybook, validatePlaybookSnapshot, type BrandPlaybook } from './brand-playbook';

const valid = (): BrandPlaybook => ({
  ...emptyPlaybook('brand_1', 'Mine', 'douyin'),
  portrait: { text: '快节奏科技测评', en: 'Fast tech reviews.' },
  fixed: { captions: { on: true, style: { color: '#ffffff' } }, pauses: { mode: 'tight' }, loudness: { lufs: -15 }, logo: { key: 'uploads/u/logo.png', kind: 'image', width: 200, height: 80, corner: 'top-right', widthPct: 12, opacity: 1 } },
  moves: [{ kind: 'punch_in', variants: ['punch', 'slow-push'], frequency: 'moderate', maxPerMin: 2, trigger: { text: '说到结论时', en: 'On a conclusion.' }, evidence: { videos: ['v1', 'v2'], confidence: 'high' } }],
  structure: { opening: { text: '开门见山', en: 'Opens on the point.' }, pace: { cutsPerMin: [15, 26] }, rules: [] },
});

describe('validatePlaybook', () => {
  it('accepts a playbook and a blank one', () => {
    expect(() => validatePlaybook(valid())).not.toThrow();
    expect(() => validatePlaybook(emptyPlaybook('b', 'B'))).not.toThrow();
  });

  it('refuses the field that is wrong, never patching it', () => {
    const cases: [(p: BrandPlaybook) => void, RegExp][] = [
      [p => { (p as { schema: number }).schema = 0; }, /schema/],
      [p => { p.moves[0]!.variants = ['whip']; }, /moves\.0\.variants/],
      [p => { p.moves.push({ ...p.moves[0]! }); }, /同一招式/],
      [p => { (p.moves[0] as { frequency: string }).frequency = 'every 6s'; }, /frequency/],
      [p => { p.fixed.loudness = { lufs: 3 }; }, /loudness/],
      [p => { p.fixed.logo!.key = 'blob:local'; }, /fixed\.logo/],
      [p => { p.structure.pace = { cutsPerMin: [30, 10] }; }, /structure\.pace/],
      [p => { p.fixed.captions!.style = { color: 'red' }; }, /captions\.style\.color/],
    ];
    for (const [mutate, error] of cases) {
      const playbook = valid(); mutate(playbook);
      expect(() => validatePlaybook(playbook)).toThrow(error);
    }
  });

  it('refuses a brand kit from before playbooks', () => {
    expect(() => validatePlaybook({ id: 'b', name: 'Old', version: 3, captions: {}, framing: { aspect: '9:16' } })).toThrow(/schema/);
  });
});

describe('playbookSnapshot', () => {
  it('drops the source list and copies deeply', () => {
    const playbook = valid();
    const snapshot = playbookSnapshot(playbook);
    expect(snapshot).not.toHaveProperty('source');
    playbook.moves[0]!.trigger.text = 'changed';
    expect(snapshot.moves[0]!.trigger.text).toBe('说到结论时');
    expect(() => validatePlaybookSnapshot(snapshot)).not.toThrow();
  });
});
