import { describe, expect, it } from 'vitest';
import { mediaCacheEvictionPlan, MEDIA_CACHE_MAX_BYTES, MEDIA_CACHE_RECENT_MS } from './local-media-cache';

const now = 10_000_000;
const entry = (key: string, lastAccess = 1, cloudConfirmed = true) => ({ key, lastAccess, cloudConfirmed, bytes: MEDIA_CACHE_MAX_BYTES / 2 });
describe('automatic media cache policy', () => {
  it('stays idle below the high watermark', () => {
    expect(mediaCacheEvictionPlan([entry('a')], { quota: 100 * MEDIA_CACHE_MAX_BYTES }, 0, false, now).reclaimBytes).toBe(0);
  });
  it('reclaims down to the low watermark, oldest first, without touching unuploaded or recent files', () => {
    const plan = mediaCacheEvictionPlan([entry('newer', 2), entry('oldest'), entry('unsynced', 0, false), entry('recent', now - 1)], {}, 0, false, now);
    expect(plan.candidates.map(item => item.key)).toEqual(['oldest', 'newer']);
    expect(plan.reclaimBytes).toBeCloseTo(MEDIA_CACHE_MAX_BYTES * 1.3);
  });
  it('accounts for incoming bytes and overall origin pressure from other storage', () => {
    const plan = mediaCacheEvictionPlan([entry('old')], { quota: MEDIA_CACHE_MAX_BYTES * 20, usage: MEDIA_CACHE_MAX_BYTES * 17 }, MEDIA_CACHE_MAX_BYTES / 2, false, now);
    expect(plan.reclaimBytes).toBeCloseTo(MEDIA_CACHE_MAX_BYTES * 3.5);
    expect(plan.candidates).toHaveLength(1);
  });
  it('keeps the recent-read guard even on a quota failure', () => {
    expect(mediaCacheEvictionPlan([entry('active', now - MEDIA_CACHE_RECENT_MS + 1)], {}, 1, true, now).candidates).toEqual([]);
  });
});
