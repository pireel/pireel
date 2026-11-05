import { describe, expect, it } from 'vitest';
import { idleMediaCacheEntries, mediaCacheEvictionPlan, MEDIA_CACHE_IDLE_MS, MEDIA_CACHE_MAX_BYTES } from './local-media-cache';

const now = 10_000_000;
const entry = (key: string, lastAccess = 1, cloudConfirmed = true) => ({ key, lastAccess, cloudConfirmed, bytes: MEDIA_CACHE_MAX_BYTES / 2 });
describe('automatic media cache policy', () => {
  it('stays idle below the high watermark', () => {
    expect(mediaCacheEvictionPlan([entry('a')], { quota: 100 * MEDIA_CACHE_MAX_BYTES }, 0, false).reclaimBytes).toBe(0);
  });
  it('reclaims down to the low watermark, used longest ago first, never media the cloud does not hold', () => {
    const plan = mediaCacheEvictionPlan([entry('newer', 2), entry('oldest'), entry('unsynced', 0, false)], {}, 0, false);
    expect(plan.candidates.map(item => item.key)).toEqual(['oldest', 'newer']);
    expect(plan.reclaimBytes).toBeCloseTo(MEDIA_CACHE_MAX_BYTES * .8);
  });
  it('accounts for incoming bytes and overall origin pressure from other storage', () => {
    const plan = mediaCacheEvictionPlan([entry('old')], { quota: MEDIA_CACHE_MAX_BYTES * 20, usage: MEDIA_CACHE_MAX_BYTES * 17 }, MEDIA_CACHE_MAX_BYTES / 2, false);
    expect(plan.reclaimBytes).toBeCloseTo(MEDIA_CACHE_MAX_BYTES * 3.5);
    expect(plan.candidates).toHaveLength(1);
  });
  it('clears on close only what nobody opened for a week and the cloud holds', () => {
    const idle = idleMediaCacheEntries([entry('week-old', now - MEDIA_CACHE_IDLE_MS - 1), entry('yesterday', now - 86_400_000), entry('unsynced', 0, false)], now);
    expect(idle.map(item => item.key)).toEqual(['week-old']);
  });
});
