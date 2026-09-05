import { describe, expect, it } from 'vitest';
import { durableFileSig, fileMatchesSig, fileNameFromSig, fileSig, isContentSig, rememberDurableFileSig, sigSize } from './media';

describe('content signature', () => {
  it('identifies bytes, not filename, mtime or picker MIME', async () => {
    const a = new File(['same-bytes'], 'a.mov', { type: '', lastModified: 1 });
    const b = new File(['same-bytes'], 'renamed-copy.mov', { type: 'video/quicktime', lastModified: 999 });
    const sigA = await durableFileSig(a);
    expect(sigA).toBe(await durableFileSig(b));
    expect(isContentSig(sigA)).toBe(true);
    expect(sigA).toMatch(/^pireel2:[0-9a-f]{32}:10$/);
    expect(sigSize(sigA)).toBe(10);
    expect(fileNameFromSig(sigA)).toBe('');
    expect(fileSig(a)).toBe(sigA); // remembered on the File
  });

  it('separates files that differ only in the middle of a large body', async () => {
    const body = new Uint8Array(1_000_000);
    const other = new Uint8Array(1_000_000);
    other[500_000] = 1;
    const a = new File([body], 'a.bin');
    const b = new File([other], 'b.bin');
    expect(await durableFileSig(a)).not.toBe(await durableFileSig(b));
  });

  it('validates legacy locators without rewriting them', async () => {
    const file = new File(['legacy'], 'old.mp4', { type: 'video/mp4', lastModified: 42 });
    expect(await fileMatchesSig(file, 'old.mp4:6:42')).toBe(true);
    expect(await fileMatchesSig(file, 'old.mp4:6:43')).toBe(false);
    expect(sigSize('old.mp4:6:42')).toBe(6);
    expect(fileNameFromSig('old.mp4:6:42')).toBe('old.mp4');
    expect(fileNameFromSig('old.mp4#pireel=0123456789abcdef0123456789abcdef:6:42')).toBe('old.mp4');
    const content = await durableFileSig(new File(['legacy'], 'x'));
    expect(await fileMatchesSig(file, content)).toBe(true);
    expect(await fileMatchesSig(new File(['legacy!'], 'x'), content)).toBe(false);
    const remembered = rememberDurableFileSig(new File(['z'], 'z'), 'z:1:0');
    expect(fileSig(remembered)).toBe('z:1:0');
  });
});
