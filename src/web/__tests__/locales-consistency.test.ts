import fs from 'node:fs';
import path from 'node:path';
import { locales } from '../i18n/config';

const LOCALES_DIR = path.resolve(__dirname, '../locales');

type JsonRecord = Record<string, unknown>;

function flattenKeys(obj: JsonRecord, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as JsonRecord, fullKey);
    }
    return [fullKey];
  });
}

function readLocale(locale: string): JsonRecord {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as JsonRecord;
}

function getValueAtPath(obj: JsonRecord, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as JsonRecord)[part];
    }
    return undefined;
  }, obj);
}

describe('locale files (.claude/rules/i18n.md: 7 languages from day one)', () => {
  it('exist for all 7 required languages', () => {
    locales.forEach((locale) => {
      const filePath = path.join(LOCALES_DIR, `${locale}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  it('share the exact same set of keys across all locales (no missing translation keys)', () => {
    const [baseline, ...rest] = locales.map((locale) => ({
      locale,
      keys: flattenKeys(readLocale(locale)).sort(),
    }));

    rest.forEach(({ locale, keys }) => {
      expect({ locale, keys }).toEqual({ locale, keys: baseline.keys });
    });
  });

  it('does not contain empty translation values', () => {
    locales.forEach((locale) => {
      const content = readLocale(locale);
      flattenKeys(content).forEach((key) => {
        const value = getValueAtPath(content, key);
        expect(typeof value).toBe('string');
        expect((value as string).trim().length).toBeGreaterThan(0);
      });
    });
  });
});
