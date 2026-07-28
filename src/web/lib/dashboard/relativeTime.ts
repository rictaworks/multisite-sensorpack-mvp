/**
 * Pure helper turning a (now, timestamp) pair into a coarse unit + magnitude,
 * so the presentation layer can format it via i18n (see
 * locales/*.json → dashboard.relativeTime.*) instead of building locale text
 * here (.claude/rules/i18n.md: no user-facing strings outside locale files).
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type ElapsedUnit = 'justNow' | 'minutes' | 'hours' | 'days';

export interface ElapsedDescription {
  unit: ElapsedUnit;
  value: number;
}

export function describeElapsed(now: number, timestampMs: number): ElapsedDescription {
  const elapsedMs = Math.max(0, now - timestampMs);

  if (elapsedMs < MINUTE_MS) {
    return { unit: 'justNow', value: 0 };
  }
  if (elapsedMs < HOUR_MS) {
    return { unit: 'minutes', value: Math.floor(elapsedMs / MINUTE_MS) };
  }
  if (elapsedMs < DAY_MS) {
    return { unit: 'hours', value: Math.floor(elapsedMs / HOUR_MS) };
  }
  return { unit: 'days', value: Math.floor(elapsedMs / DAY_MS) };
}
