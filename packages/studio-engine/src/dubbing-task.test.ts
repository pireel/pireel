import { describe, expect, it } from 'vitest';
import { dubbingRate, dubbingSpeechWindow, dubbingVideoDocument, splitDubbingScript, dubbingSpeakers, dubbingTurns, dubbingVoicesReady } from './dubbing-task';
import { firstNarrativeAssetId } from './composition';
describe('dubbing timing', () => {
  it('fits the spoken window while preserving leading and trailing picture time', () => {
    expect(dubbingSpeechWindow([{ text: 'Hello', start: 1, end: 4 }, { text: 'world', start: 5, end: 7 }], 8)).toEqual({ start: 1, end: 7, duration: 6 });
    expect(dubbingRate(7.2, 6)).toBeCloseTo(1.2);
  });
  it('rejects excessive retiming and invalid input instead of truncating speech', () => {
    expect(() => dubbingRate(15, 6)).toThrow();
    expect(dubbingSpeechWindow([{ text: 'a', start: 1, end: 2, speaker: 'a' }, { text: 'b', start: 3, end: 4, speaker: 'b' }], 5).duration).toBe(3);
    expect(() => dubbingSpeechWindow([], 5)).toThrow();
    expect(dubbingSpeechWindow([{ text: 'a', start: 0, end: 1800 }], 1800).duration).toBe(1800);
    expect(() => dubbingSpeechWindow([{ text: 'a', start: 0, end: 1801 }], 1801)).toThrow('30 分钟');
  });
  it('builds an editable document referencing the translated output', () => {
    const doc = dubbingVideoDocument('task', 'dub-output', 'blob:output', 'english.mp4', 1920, 1080, 8);
    expect(doc.assets[firstNarrativeAssetId(doc)!]?.locator.localSig).toBe('dub-output');
    expect(doc.appearance.captionStyle?.on).not.toBe(true);
  });
});

it('splits long scripts without losing text or breaking Unicode', () => {
  const text = ('长文案😀。 This is a complete sentence.\n').repeat(500);
  const parts = splitDubbingScript(text);
  expect(parts.length).toBeGreaterThan(1); expect(parts.join('')).toBe(text);
  expect(parts.every((part) => part.length <= 4000 && !/[\uD800-\uDBFF]$/.test(part))).toBe(true);
  expect(() => splitDubbingScript('a'.repeat(60001))).toThrow();
});

it('keeps speaker turns, gaps and unknown speakers distinct', () => {
  const transcript = [{ text: 'a', start: 0, end: 1, speaker: '0' }, { text: 'b', start: 1.2, end: 2, speaker: '0' }, { text: 'c', start: 4, end: 5, speaker: '1' }, { text: 'unknown', start: 6, end: 7 }];
  expect(dubbingSpeakers(transcript).map((speaker) => speaker.id)).toEqual(['speaker:0', 'speaker:1', 'unidentified']);
  expect(dubbingTurns(transcript, 8)).toMatchObject([{ speaker: 'speaker:0', start: 0, end: 2, text: 'a\nb' }, { speaker: 'speaker:1', start: 4, end: 5 }, { speaker: 'unidentified', start: 6, end: 7 }]);
  expect(dubbingVoicesReady(transcript, { language: 'English', voiceId: 'first', lipSync: false })).toBe(false);
  expect(dubbingVoicesReady(transcript, { language: 'English', voiceId: 'first', lipSync: false, speakerVoices: { 'speaker:1': 'second', unidentified: 'third' } })).toBe(true);
});
