import { describe, expect, it } from 'vitest';
import { dubbingRate, dubbingSpeechWindow, dubbingVideoDocument } from './dubbing-task';
import { firstNarrativeAssetId } from './composition';
describe('dubbing timing', () => {
  it('fits the spoken window while preserving leading and trailing picture time', () => {
    expect(dubbingSpeechWindow([{ text: 'Hello', start: 1, end: 4 }, { text: 'world', start: 5, end: 7 }], 8)).toEqual({ start: 1, end: 7, duration: 6 });
    expect(dubbingRate(7.2, 6)).toBeCloseTo(1.2);
  });
  it('rejects excessive retiming, multiple speakers and invalid input instead of truncating speech', () => {
    expect(() => dubbingRate(15, 6)).toThrow();
    expect(() => dubbingSpeechWindow([{ text: 'a', start: 1, end: 2, speaker: 'a' }, { text: 'b', start: 3, end: 4, speaker: 'b' }], 5)).toThrow('单人');
    expect(() => dubbingSpeechWindow([], 5)).toThrow();
    expect(() => dubbingSpeechWindow([{ text: 'a', start: 0, end: 200 }], 200)).toThrow('2 分钟');
  });
  it('builds an editable document referencing the translated output', () => {
    const doc = dubbingVideoDocument('task', 'dub-output', 'blob:output', 'english.mp4', 1920, 1080, 8);
    expect(doc.assets[firstNarrativeAssetId(doc)!]?.locator.localSig).toBe('dub-output');
    expect(doc.appearance.captionStyle?.on).not.toBe(true);
  });
});
