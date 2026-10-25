import { afterEach, expect, it } from 'vitest';
import { localized, registerMessages, setStudioLocale, setStudioLocaleSource, studioLocale, t } from './i18n';

registerMessages('zh', { 'test.i18n.greeting': '你好，{name}' });
registerMessages('en', { 'test.i18n.greeting': 'Hello, {name}' });
afterEach(() => { setStudioLocaleSource(undefined); setStudioLocale('zh'); });

it('reads a per-request locale from the source instead of the global', () => {
  let current = 'en';
  setStudioLocale('zh');
  setStudioLocaleSource(() => current);
  expect(studioLocale()).toBe('en');
  expect(t('test.i18n.greeting', { name: 'Ada' })).toBe('Hello, Ada');
  current = 'zh';
  expect(t('test.i18n.greeting', { name: 'Ada' })).toBe('你好，Ada');
  expect(localized({ en: 'Sound', zh: '音效' })).toBe('音效');
});

it('uses the global locale once the source is cleared', () => {
  setStudioLocaleSource(() => 'en');
  setStudioLocaleSource(undefined);
  setStudioLocale('zh');
  expect(t('test.i18n.greeting', { name: 'Ada' })).toBe('你好，Ada');
});
