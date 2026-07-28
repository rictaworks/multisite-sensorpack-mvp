/**
 * Central source of truth for supported locales and text direction.
 * Per .claude/rules/i18n.md the MVP must ship 7 locales from day one:
 * ja / en / fr / zh / ru / es / ar (ar requires RTL rendering).
 */
export const locales = ['ja', 'en', 'fr', 'zh', 'ru', 'es', 'ar'] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'ja';

const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(['ar']);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale as AppLocale);
}

export function getTextDirection(locale: string): 'ltr' | 'rtl' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
