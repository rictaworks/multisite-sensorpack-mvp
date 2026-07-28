import nextConfig from 'eslint-config-next';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    ignores: ['coverage/**', 'jest.config.js', 'jest.setup.ts'],
  },
];

export default config;
