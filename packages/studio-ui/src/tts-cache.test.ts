import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedTts, setCachedTts, ttsCacheKey, type CachedTtsAsset } from './tts-cache';
import { __setKvBackendForTest } from './idb-kv';

describe('tts cache key', () => {
  const values = new Map<string, unknown>();
  beforeEach(() => {
    values.clear();
    __setKvBackendForTest({
      get: async (key) => values.get(key),
      set: async (key, value) => void values.set(key, value),
      delete: async (key) => void values.delete(key),
    });
  });
  afterEach(() => {
    __setKvBackendForTest(null);
    vi.unstubAllGlobals();
  });

  it('is stable across property order and ignores non-acoustic label fields', () => {
    const key = ttsCacheKey({ text: '普通的人生，依然值得被爱', voiceId: 'voice_1', emotion: 'calm' });
    expect(ttsCacheKey({ emotion: 'calm', voiceId: 'voice_1', text: '普通的人生，依然值得被爱' })).toBe(key);
    expect(ttsCacheKey({ text: '普通的人生，依然值得被爱', voiceId: 'voice_1', emotion: 'calm', name: '奥德赛口播 v2' })).toBe(key);
    expect(ttsCacheKey({ text: '普通的人生，依然值得被爱', voiceId: 'voice_1', emotion: 'calm', name: null })).toBe(key);
  });

  it('changes when any acoustic-relevant field changes', () => {
    const base = { text: 'hello', voiceId: 'voice_1' };
    const key = ttsCacheKey(base);
    expect(ttsCacheKey({ ...base, text: 'hello!' })).not.toBe(key);
    expect(ttsCacheKey({ ...base, voiceId: 'voice_2' })).not.toBe(key);
    expect(ttsCacheKey({ ...base, emotion: 'calm' })).not.toBe(key);
    expect(ttsCacheKey({ ...base, instruction: 'soft close' })).not.toBe(key);
  });

  it('round-trips an asset receipt through the cache backend', async () => {
    const asset: CachedTtsAsset = {
      id: 'up_1', kind: 'audio', url: 'https://cdn.example/a.mp3', mime: 'audio/mpeg',
      model: 'tts-1', voiceId: 'voice_1', voiceLabel: '张欣怡',
      transcriptText: 'hello', charCount: 5, durationSec: 3.2, estimatedDurationSec: 3,
    };
    const key = ttsCacheKey({ text: 'hello', voiceId: 'voice_1' });
    setCachedTts(key, asset);
    await expect(getCachedTts(key)).resolves.toEqual(asset);
    await expect(getCachedTts(ttsCacheKey({ text: 'other', voiceId: 'voice_1' }))).resolves.toBeNull();
  });
});
