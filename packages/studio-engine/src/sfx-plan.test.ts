import { expect, it } from 'vitest';
import { sfxDensityGuidance, validateSfxPlan } from './sfx-plan';
import { normalizeSfxOptions } from './sfx-task';
const cues = [0, 5, 10, 15].map((start, id) => ({ id, start, end: start + 2, text: '内容' }));
const rows = cues.map(cue => ({ cueId: cue.id, start: cue.start, style: 'soft', volumeDb: -18 }));
it('uses density only as model guidance and never caps or spaces valid choices', () => {
  expect(sfxDensityGuidance('low')).not.toBe(sfxDensityGuidance('high'));
  expect(validateSfxPlan(rows, cues, 30)).toHaveLength(4);
  const many = Array.from({ length: 600 }, (_, i) => ({ cueId: 0, start: i / 1000, style: 'soft', volumeDb: -18 }));
  expect(validateSfxPlan(many, cues, 30)).toHaveLength(600);
  expect(validateSfxPlan([], cues, 30)).toEqual([]);
});
it('preserves three identical sounds on consecutive list words within the same ASR segment', () => {
  const list = [{ id: 0, start: 1, end: 4, text: '第一、第二、第三', anchors: [1, 1.5, 2].map((start, id) => ({ id, start, text: String(id) })) }];
  const sounds = list[0].anchors.map(word => ({ cueId: 0, wordId: word.id, start: word.start, style: 'soft', soundId: 'confirmation-001', intensity: 'normal', volumeDb: -18 }));
  expect(validateSfxPlan(sounds, list, 5)).toEqual(sounds);
});
it('rejects invalid references and exact duplicate events without rejecting distinct events in a cue', () => {
  for (const patch of [{ cueId: 99 }, { start: 3 }, { style: 'unknown' }, { volumeDb: 0 }, { start: NaN }, { wordId: 99 }]) expect(() => validateSfxPlan([{ ...rows[0], ...patch }], cues, 30)).toThrow();
  expect(() => validateSfxPlan([rows[0], rows[0]], cues, 30)).toThrow('完全重复');
  expect(validateSfxPlan([rows[0], { ...rows[0], start: .5 }], cues, 30)).toHaveLength(2);
});
it('maps old scene settings to a density without changing the old record', () => {
  const legacy = { style: 'whoosh' as const, maxCount: 8, volumeDb: -12, captions: true }; const before = structuredClone(legacy);
  expect(normalizeSfxOptions(legacy)).toEqual({ density: 'high' }); expect(legacy).toEqual(before);
});

it('supports generated one-shots only when the request is explicit and unambiguous', () => {
  const row = { ...rows[0], intensity: 'normal', generate: { prompt: 'wood door creak', reason: 'The catalog has only interface sounds', durationSec: 2 } };
  expect(validateSfxPlan([row], cues, 30)[0]).toEqual(row);
  for (const patch of [{ soundId: 'glass-001' }, { intensity: 'loud' }, { generate: { ...row.generate, durationSec: 30 } }, { generate: { ...row.generate, prompt: '' } }, { generate: { ...row.generate, reason: '' } }]) expect(() => validateSfxPlan([{ ...row, ...patch }], cues, 30)).toThrow();
});
