import { defaultLocale, getTextDirection, isRtlLocale, locales } from '../i18n/config';

describe('i18n config', () => {
  it('declares exactly the 7 required locales (.claude/rules/i18n.md)', () => {
    expect([...locales].sort()).toEqual(['ar', 'en', 'es', 'fr', 'ja', 'ru', 'zh']);
  });

  it('defaults to Japanese', () => {
    expect(defaultLocale).toBe('ja');
  });

  it('switches to RTL only for Arabic, LTR for every other locale', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(getTextDirection('ar')).toBe('rtl');

    locales
      .filter((locale) => locale !== 'ar')
      .forEach((locale) => {
        expect(isRtlLocale(locale)).toBe(false);
        expect(getTextDirection(locale)).toBe('ltr');
      });
  });
});
