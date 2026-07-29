/**
 * 利用規約・プライバシーポリシーの節の並び（Issue #70）。
 *
 * 順序がそのまま表示順になる。文言はロケールファイル側にあり、ここには構造だけを置く。
 */

/** 文書の最終改訂日（JST）。レンダー中に現在時刻を読まないため定数として持つ。 */
export const LEGAL_LAST_UPDATED = '2026-07-29';

export const TERMS_SECTION_KEYS = [
  'scope',
  'service',
  'account',
  'prohibited',
  'disclaimer',
  'changes',
  'law',
] as const;

export const PRIVACY_SECTION_KEYS = [
  'collected',
  'notCollected',
  'purpose',
  'thirdParty',
  'cookies',
  'retention',
  'contact',
] as const;
