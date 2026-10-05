import { describe, expect, it } from 'vitest';
import { cjkFontChoices, fontsSystemPrompt, parseFonts } from './brand-fonts';

describe('brand fonts', () => {
  it('offers the Chinese faces the platform renders', () => {
    const ids = cjkFontChoices().map(choice => choice.id);
    expect(ids).toContain('sans');
    expect(ids).toContain('web:smiley-sans');
    expect(fontsSystemPrompt()).toContain('web:douyin-sans');
  });

  it('keeps faces the platform has, finds a named Google family, lists the rest as unknown', () => {
    const { fonts, unknown } = parseFonts(JSON.stringify({
      captions: { look: '粗黑体', actual: '思源黑体 Heavy', weight: 'black', id: 'sans' },
      titles: { look: 'condensed heavy sans', id: 'google:anton' },
      cover: { look: '综艺体', id: 'web:fangzheng-zongyi' },
    }));
    expect(fonts.captions).toEqual({ id: 'sans', look: '粗黑体', actual: '思源黑体 Heavy', weight: 'black' });
    expect(fonts.titles?.id).toBe('google:Anton');
    expect(unknown).toEqual(['cover']);
  });
});
