import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import { detectSkillSettings, measureSkillStyle } from './skill-format';

describe('style a finished edit shows, for Create Skill', () => {
  it('reads the style values it used, leaving a brand-supplied caption look out', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    document.appearance.captionStyle = { on: true, preset: 'karaoke', yPct: 72, scale: 1.7, font: 'web:lxgw-wenkai', sub: { lang: 'en' } };
    expect(detectSkillSettings(document, { switches: ['captions', 'rough-cut', 'unknown'], pauses: 'tight' })).toEqual({
      switches: ['captions', 'rough-cut'],
      pauses: 'tight',
      captions: { preset: 'karaoke', yPct: 72, scale: 1.7, font: 'web:lxgw-wenkai' },
    });
    expect(detectSkillSettings(document, { brandCaptions: true }).captions).toBeUndefined();
  });

  it('measures the edit as rounded numbers', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    expect(measureSkillStyle(document)).toEqual({ durationSec: 0, storyCutsPerMinute: 0, meanShotSec: 0, broll: null, captions: { on: false, emphasizedWords: 0 }, transitions: 0, music: false, soundEffects: 0 });
  });
});
