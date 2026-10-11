import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { SFX_LIBRARY } from '@pireel/studio-engine/sfx-library';
import pack from './workflow-art/sfx-showcase-pack-v1.provenance.json';
it('packages every licensed catalog sound once in a playable, bounded PCM file', () => {
  const wav = readFileSync('oss/packages/studio-ui/src/workflow-art/sfx-showcase-pack-v1.wav');
  expect(pack.entries.map(entry => entry.id)).toEqual(SFX_LIBRARY.map(sound => sound.id));
  expect(pack.count).toBe(SFX_LIBRARY.length);
  expect(createHash('sha256').update(wav).digest('hex')).toBe(pack.sha256);
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(48000);
  expect((wav.length - 44) / 2 / 48000).toBeCloseTo(pack.durationSec, 2);
  expect(Math.max(...pack.waveform)).toBeGreaterThan(.2);
});
