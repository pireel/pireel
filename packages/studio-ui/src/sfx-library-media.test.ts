import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { SFX_LIBRARY } from '@pireel/studio-engine/sfx-library';
it('ships 32 distinct licensed non-silent WAV assets matching the catalog hashes', () => {
  const license = readFileSync(new URL('./sfx-library-assets/LICENSE.txt', import.meta.url), 'utf8');
  expect(license).toContain('CC0'); expect(license).toContain('Kenney');
  expect(SFX_LIBRARY).toHaveLength(32); expect(new Set(SFX_LIBRARY.map(sound => sound.sha256)).size).toBe(32);
  for (const sound of SFX_LIBRARY) {
    const file = readFileSync(new URL(`./sfx-library-assets/${sound.id.replace('-', '_')}.wav`, import.meta.url));
    expect(file.toString('ascii', 0, 4)).toBe('RIFF'); expect(createHash('sha256').update(file).digest('hex')).toBe(sound.sha256);
    let offset = 12; let peak = 0; let count = 0;
    while (offset + 8 < file.length) {
      const kind = file.toString('ascii', offset, offset + 4); const length = file.readUInt32LE(offset + 4);
      if (kind === 'data') for (let p = offset + 8; p + 1 < offset + 8 + length; p += 2) { peak = Math.max(peak, Math.abs(file.readInt16LE(p))); count++; }
      offset += 8 + length + length % 2;
    }
    expect(peak).toBeGreaterThan(100); expect(count / 48000).toBeGreaterThan(.07); expect(count / 48000).toBeLessThan(1.5);
  }
});
