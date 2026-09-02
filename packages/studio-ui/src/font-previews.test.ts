import { describe, expect, it } from 'vitest';
import { WEB_FONTS } from '@pireel/studio-engine/font-library';
import { FONT_PREVIEWS } from './font-previews';

// The picker shows each library font as a baked SVG outline instead of rendering in the face
// itself (no font download to open the list). Every WEB_FONTS entry needs one; regenerate with
// scripts/build-font-previews.py after adding a font.
describe('font previews', () => {
  it('bakes an outline of the zh label for every library font', () => {
    for (const font of WEB_FONTS) {
      const preview = FONT_PREVIEWS[font.id];
      expect(preview, `missing preview for ${font.id}`).toBeDefined();
      expect(preview!.text).toBe(font.label.zh);
      expect(preview!.d.length).toBeGreaterThan(100);
      const [x, y, w, h] = preview!.viewBox.split(' ').map(Number);
      expect([x, y]).toEqual([0, 0]);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
  });

  it('carries no stale preview for a font that left the library', () => {
    const known = new Set(WEB_FONTS.map((font) => font.id));
    for (const id of Object.keys(FONT_PREVIEWS)) expect(known.has(id), `orphan preview ${id}`).toBe(true);
  });
});
