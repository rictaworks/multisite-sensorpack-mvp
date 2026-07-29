// next/jest wires up SWC-based transforms so we don't hand-roll a Babel/ts-jest
// pipeline (see .claude/rules/architecture.md: avoid reinventing the wheel).
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  // e2e/** holds Playwright specs (Issue #25: `npm run test:e2e`), which use
  // `@playwright/test`'s own `test`/`expect` globals — Jest must not try to
  // collect them (its default testMatch would otherwise pick up
  // `e2e/**/*.spec.ts` too, since it matches any `*.spec.ts` file).
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/'],
};

module.exports = createJestConfig(customJestConfig);
