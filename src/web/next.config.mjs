import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next-intl / use-intl ship ESM-only builds; listing them here makes both
  // the Next.js build *and* next/jest (which derives its transformIgnorePatterns
  // from this list) transpile them instead of choking on `export` syntax.
  transpilePackages: [
    'next-intl',
    'use-intl',
    '@formatjs/fast-memoize',
    '@formatjs/icu-messageformat-parser',
    '@formatjs/icu-skeleton-parser',
    '@formatjs/ecma402-abstract',
    '@schummar/icu-type-parser',
    'icu-minify',
    'intl-messageformat',
  ],
};

export default withNextIntl(nextConfig);
