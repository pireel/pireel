import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2 } from './editor-document';

describe('EditorDocument V2 canvas command', () => {
  it('marks an explicit canvas as configured without mutating the prior snapshot', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch',
      patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(document.canvas).toEqual({ width: 1080, height: 1920, fps: 30, configured: false });
    expect(result.document.canvas).toEqual({ width: 1080, height: 1920, fps: 30, configured: true });

    const noOp = applyEditorCommand(result.document, {
      type: 'canvas.patch',
      patch: { width: 1080, height: 1920 },
    });
    expect(noOp.ok).toBe(true);
    if (!noOp.ok) return;
    expect(noOp.document).toBe(result.document);
  });

  it('rejects invalid dimensions atomically', () => {
    const document = emptyEditorDocumentV2();
    const result = applyEditorCommand(document, {
      type: 'canvas.patch',
      patch: { width: 1080.5, height: 0 },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'invalid-range', path: 'canvas' } });
  });
});
