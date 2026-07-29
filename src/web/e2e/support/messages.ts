import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads a locale's translated strings straight from the same source of
 * truth the app itself renders from (src/web/locales/*.json), instead of
 * re-typing translated copies inside spec files. Two reasons:
 *  - .claude/rules/i18n.md: UI copy lives in the locale files, not inlined
 *    in source; mirroring that discipline in the tests avoids a second,
 *    easily-stale copy of every string a test asserts against.
 *  - When a future writer-agent pass edits copy, these tests keep passing
 *    (or fail for the right reason — a missing/renamed key — rather than a
 *    silently wrong hardcoded translation baked into a spec file).
 */
export type AppLocale = 'ja' | 'en' | 'fr' | 'zh' | 'ru' | 'es' | 'ar';

export const ALL_LOCALES: AppLocale[] = ['ja', 'en', 'fr', 'zh', 'ru', 'es', 'ar'];

const messagesCache = new Map<AppLocale, unknown>();

function readLocaleFile(locale: AppLocale): unknown {
  const cached = messagesCache.get(locale);
  if (cached) return cached;

  const filePath = path.resolve(__dirname, '..', '..', 'locales', `${locale}.json`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  messagesCache.set(locale, parsed);
  return parsed;
}

/**
 * Resolves a dotted key path (e.g. "login.devBypass") against a locale's
 * messages file. Throws loudly (no fallback) if the key is missing — a
 * missing translation is exactly the kind of regression this suite should
 * fail on, not silently skip (.claude/rules/coding-style.md: no fallback).
 */
export function t(locale: AppLocale, keyPath: string): string {
  const messages = readLocaleFile(locale);
  const value = keyPath.split('.').reduce<unknown>((node, key) => {
    if (node !== null && typeof node === 'object' && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, messages);

  if (typeof value !== 'string') {
    throw new Error(`[e2e/support/messages] "${keyPath}" is not a string in locales/${locale}.json`);
  }
  return value;
}

/** Simplified `{placeholder}` interpolation matching next-intl's ICU-lite usage in this app's copy. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template
  );
}
