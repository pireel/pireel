import { expect, it } from 'vitest';
import { buildCaptionBaseDocument } from '@pireel/studio-engine/caption-task';
import { planCaptionDocument, translateCaptionPlan, assembleCaptionDocument } from './caption-workflow-artifacts';
const options = { presetId: 'clean', aspect: 'original' as const, shortenPauses: false, translationLanguage: 'English' as const };
it('translates a detached JSON plan and validates stable IDs/version before document assembly', async () => {
  const document = buildCaptionBaseDocument({ projectId: 'p', sourceSig: 'source', sourceUrl: '', width: 1920, height: 1080, durationSec: 5, options, transcript: [] });
  const plan = planCaptionDocument(document, [{ text: '你好世界', start: 0, end: 3 }], options);
  const translation = await translateCaptionPlan(JSON.parse(JSON.stringify(plan.units)), 'English', async rows => rows.map(row => ({ index: row.index, text: 'Hello world' })), () => {});
  expect(JSON.stringify(assembleCaptionDocument(document, plan, translation, options))).toContain('Hello world');
  expect(() => assembleCaptionDocument(document, plan, { ...translation, sourceKey: 'stale' }, options)).toThrow('版本');
  expect(() => assembleCaptionDocument(document, plan, { ...translation, items: [{ id: 'unknown', lines: ['Hello'] }] }, options)).toThrow('不完整');
  expect(JSON.stringify(assembleCaptionDocument(document, plan, null, { ...options, translationLanguage: undefined }))).not.toContain('Hello world');
});
