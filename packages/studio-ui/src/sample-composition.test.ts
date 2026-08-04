import { describe, expect, it } from 'vitest';
import { PREVIEW_RUNTIME } from './sample-composition';

describe('preview runtime', () => {
  it('contains only syntactically valid inline scripts', () => {
    const scripts = [...PREVIEW_RUNTIME.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });
});
