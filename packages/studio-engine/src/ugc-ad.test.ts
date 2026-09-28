import { expect, it } from 'vitest';
import { DEFAULT_UGC_AD_OPTIONS, readyUgcAdOptions, validUgcAdOptions } from './ugc-ad';
import { planUgcAdText } from './ugc-ad-plan';
import { ugcAdWorkflowDefinition } from './workflow-ugc-ad-template';
const brief = { ...DEFAULT_UGC_AD_OPTIONS, productName: '晨光杯', claim: '容量 350ml', callToAction: '查看详情' };
it('requires a real product and CTA, keeping optional claims literal', () => {
  expect(validUgcAdOptions(DEFAULT_UGC_AD_OPTIONS)).toBe(true);
  expect(() => readyUgcAdOptions(DEFAULT_UGC_AD_OPTIONS)).toThrow('商品名称');
  expect(readyUgcAdOptions({ ...brief, claim: '' }).claim).toBe('');
  expect(validUgcAdOptions({ ...brief, claim: 'x'.repeat(241) })).toBe(false);
});
it('anchors the opening to recorded speech and uses only supplied commercial facts', () => {
  const transcript = [{ text: '这款晨光杯很方便', start: 0, end: 2 }, { text: '怎么清洗？', start: 2, end: 4 }];
  const plan = planUgcAdText(brief, transcript, 14);
  expect(plan.map(row => row.role)).toEqual(['hook', 'claim', 'cta']);
  expect(plan[0].text).toBe(transcript[0].text);
  expect(plan[1].text).toBe('容量 350ml'); expect(plan[2].text).toBe('查看详情');
  expect(plan[2].startSec + plan[2].durationSec).toBe(14);
  expect(planUgcAdText({ ...brief, angle: 'problem' }, transcript, 14)[0].text).toBe('怎么清洗？');
  expect(planUgcAdText({ ...brief, hook: '我每天用它' }, transcript, 14)[0].text).toBe('我每天用它');
  expect(planUgcAdText({ ...brief, claim: '' }, transcript, 4).map(row => row.role)).toEqual(['hook', 'cta']);
});
it('composes the existing native caption/B-roll graph and attaches local ad copy before rendering', () => {
  const config = { presetId: 'clean', aspect: 'original' as const, shortenPauses: false, ugcAd: brief, broll: { assets: [], captions: true } };
  const without = ugcAdWorkflowDefinition(config, {}, null, 'project', 14, null);
  expect(without.steps.map(step => step.id)).not.toContain('analysis');
  expect(without.steps.at(-1)!.arguments.document).toEqual({ kind: 'step', stepId: 'ugc-text', key: 'document' });
  const withMedia = ugcAdWorkflowDefinition({ ...config, broll: { assets: [{ id: 'image', sig: 'sig', name: 'cup.png', kind: 'image', durationSec: 5, width: 800, height: 800 }], captions: true } }, {}, null, 'project', 14, null);
  expect(withMedia.steps.map(step => step.id)).toContain('analysis');
  expect(withMedia.steps.map(step => step.id)).toContain('match');
  expect(withMedia.steps.at(-1)!.arguments.document).toEqual({ kind: 'step', stepId: 'ugc-text', key: 'document' });
});
