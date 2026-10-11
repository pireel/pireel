import { describe, expect, it } from 'vitest';
import { sanitizeProjectContext } from './project-context';

describe('project media directory', () => {
  it('keeps a video entry\'s stored poster key and drops a non-string one', () => {
    const base = { assetId: 'a1', contentSig: 'sig1', sig: 'sig1', label: 'clip.mp4', kind: 'video', createdAt: 1 };
    const kept = sanitizeProjectContext({ localAssets: [{ ...base, posterKey: 'uploads/u1/p.webp' }] });
    expect(kept.localAssets?.[0]?.posterKey).toBe('uploads/u1/p.webp');
    const dropped = sanitizeProjectContext({ localAssets: [{ ...base, posterKey: 42 }] });
    expect(dropped.localAssets?.[0]).not.toHaveProperty('posterKey');
  });
});
