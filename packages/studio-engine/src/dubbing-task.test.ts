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

describe('dubbing phrases', () => {
  const word = (text: string, start: number, end: number) => ({ text, start, end });
  it('splits a turn at clause punctuation and pauses, joining pieces too brief to time', async () => {
    const { dubbingPhrases } = await import('./dubbing-task');
    const transcript = [{ text: '哈喽大家好，今天收到了礼物，我们拿来给大家抽奖。', start: 0, end: 9, words: [
      word('哈喽', 0, .3), word('大家好，', .3, .6), word('今天', 1, 1.5), word('收到了', 1.5, 2.2), word('礼物，', 2.2, 3), word('我们', 3.1, 3.5), word('拿来', 3.5, 4), word('给大家', 4.6, 5.5), word('抽奖。', 5.5, 6.4),
    ] }];
    expect(dubbingPhrases(transcript, 10).map(phrase => [phrase.text, phrase.start, phrase.end])).toEqual([
      ['哈喽大家好，今天收到了礼物，', 0, 3], ['我们拿来', 3.1, 4], ['给大家抽奖。', 4.6, 6.4],
    ]);
  });
  it('keeps lines without word timing whole and never joins two turns', async () => {
    const { dubbingPhrases } = await import('./dubbing-task');
    const phrases = dubbingPhrases([{ text: 'Hello there, friends.', start: 0, end: 2 }, { text: 'Next.', start: 5, end: 6 }], 8);
    expect(phrases.map(phrase => [phrase.turn, phrase.text])).toEqual([[0, 'Hello there, friends.'], [1, 'Next.']]);
    const latin = dubbingPhrases([{ text: 'Hi all', start: 0, end: 2, words: [word('Hi', 0, .5), word('all', .5, 1.2)] }], 3);
    expect(latin[0].text).toBe('Hi all');
  });
});

describe('phrase joins', () => {
  it('drops a word the previous phrase already ends with, and nothing else', async () => {
    const { stripRepeatedLead } = await import('./dubbing-task');
    expect(stripRepeatedLead("Oh, inside there's a", 'a Geek Time VIP card,')).toBe('Geek Time VIP card,');
    expect(stripRepeatedLead('It was the', 'The best day.')).toBe('best day.');
    expect(stripRepeatedLead('Inside there is', 'a card.')).toBe('a card.');
    expect(stripRepeatedLead('a', 'a')).toBe('a');
  });
});
