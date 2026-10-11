import { expect, it } from 'vitest';
import { sceneCreditInput } from './scene-credit-estimate';
import type { CaptionTaskRecord } from './scene-project';
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', scene: 'dubbing', name: 'video', sourceSig: 'source', durationSec: 60, width: 1920, height: 1080, stage: 'ready', updatedAt: 1, options: { caption: {}, aspect: 'original', shortenPauses: false, dubbing: { language: 'English', voiceId: 'voice', lipSync: false } } });

it('quotes dubbing as its fixed-price scene with the lip sync choice, whatever is cached', () => {
  const source = task(); source.transcript = [{ text: 'hello', start: 0, end: 60 }]; source.stage = 'completed';
  expect(sceneCreditInput(source, source.options)).toEqual({ scene: 'dubbing', durationSec: 60, asr: false, translation: false, emphasis: false, lipSync: false, speech: [] });
  expect(sceneCreditInput(source, { ...source.options, dubbing: { ...source.options.dubbing!, lipSync: true } }).lipSync).toBe(true);
});

it('quotes captions as their fixed-price scene regardless of translation or highlights', () => {
  const source = task(); source.scene = 'captions';
  expect(sceneCreditInput(source, { ...source.options, highlights: true, translationLanguage: 'English' })).toEqual({ scene: 'captions', durationSec: 60, asr: false, translation: false, emphasis: false, lipSync: false, speech: [] });
});

it('quotes Auto SFX as its fixed-price scene by density', () => {
  const source = task(); source.scene = 'sfx';
  expect(sceneCreditInput(source, { ...source.options, sfx: { density: 'high' } })).toEqual({ scene: 'sfx', density: 'high', durationSec: 60, asr: false, translation: false, emphasis: false, lipSync: false, speech: [] });
  expect(sceneCreditInput(source, { ...source.options, sfx: { style: 'pop', maxCount: 1, volumeDb: -18, captions: false } }).density).toBe('low');
});
