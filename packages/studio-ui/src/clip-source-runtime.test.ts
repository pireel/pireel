import { describe, expect, it } from 'vitest';
import { registerNarrativeSourceRuntime } from './clip-source-runtime';

const source = () => ({
  file: new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
  url: 'blob:clip',
  sig: 'clip.mp4:5:1',
  durationSec: 4,
});

describe('narrative source runtime registration', () => {
  it('registers every narrative source in the same clip runtime map', () => {
    const clipFiles = new Map<string, File>();
    const first = source();

    expect(registerNarrativeSourceRuntime({
      source: first,
      clipFiles,
    })).toBe('clip');
    expect(clipFiles.get(first.url)).toBe(first.file);
  });
});
