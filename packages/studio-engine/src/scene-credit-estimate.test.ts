import { expect, it } from 'vitest';
import { sceneCreditInput } from './scene-credit-estimate';
import type { CaptionTaskRecord } from './scene-project';
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', scene: 'dubbing', name: 'video', sourceSig: 'source', durationSec: 60, width: 1920, height: 1080, stage: 'ready', updatedAt: 1, options: { presetId: 'clean', aspect: 'original', shortenPauses: false, dubbing: { language: 'English', voiceId: 'voice', lipSync: false } } });
it('estimates speech from duration before transcription, without exposing transcript text', () => {
  const source = task(); const input = sceneCreditInput(source, source.options);
  expect(input.asr).toBe(true); expect(input.translation).toBe(true);
  expect(input.speech[0]).toMatchObject({ minUnits: 400, maxUnits: 1400 });
});
it('uses actual billable characters and skips completed speech when reusable', () => {
  const source = task(); source.transcript = [{ text: 'hello', start: 0, end: 60 }]; source.options.dubbing!.script = '你好abc';
  let input = sceneCreditInput(source, source.options);
  expect(input.asr).toBe(false); expect(input.translation).toBe(false); expect(input.speech[0].minUnits).toBe(7);
  source.dubbing = { language: 'English', speechSignature: JSON.stringify(['你好abc', 'voice']), speechParts: [{ url: 'audio', key: 'audio', signature: '', durationSec: 1 }] };
  expect(sceneCreditInput(source, source.options).speech).toEqual([]);
});
it('does not charge ordinary style changes and identifies optional paid caption features', () => {
  const source = task(); source.scene = 'captions'; source.transcript = [{ text: 'hello', start: 0, end: 60 }];
  expect(sceneCreditInput(source, source.options)).toMatchObject({ asr: false, translation: false, emphasis: false, speech: [] });
  expect(sceneCreditInput(source, { ...source.options, presetId: 'keywords', translationLanguage: 'English' })).toMatchObject({ translation: true, emphasis: true });
});
