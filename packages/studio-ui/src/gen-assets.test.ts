import { describe, expect, it } from 'vitest';
import { generatedAssetIndexEntry } from './gen-api';
import { alignFileToSig } from './local-media';
import { fileSig } from './media';

describe('generated media in the project directory', () => {
  it('maps a settled output to a deterministic, cloud-addressed directory entry', () => {
    const entry = generatedAssetIndexEntry(
      { jobId: 'cr_ab12/x', index: 1, kind: 'image', key: 'uploads/u1/gen.png', mime: 'image/png', prompt: '  a red bicycle on a beach  ', createdAt: 42 },
      'Image',
    );
    expect(entry).toMatchObject({
      assetId: 'gen_cr_ab12x_1',
      contentSig: 'gen:uploads/u1/gen.png',
      cloudKey: 'uploads/u1/gen.png',
      label: 'a red bicycle on a beach',
      kind: 'image',
      mime: 'image/png',
      createdAt: 42,
    });
    expect(generatedAssetIndexEntry({ jobId: 'j', index: 0, kind: 'video', key: 'k', mime: '', prompt: '', createdAt: 1 }, 'Video').label).toBe('Video');
  });

  it('binds retrieved bytes to an opaque generated locator under the entry label', () => {
    const fetched = new File(['png'], 'gen.png', { type: 'image/png' });
    const aligned = alignFileToSig(fetched, 'gen:uploads/u1/gen.png', 'a red bicycle');
    expect(aligned.name).toBe('a red bicycle');
    expect(fileSig(aligned)).toBe('gen:uploads/u1/gen.png');
  });
});
