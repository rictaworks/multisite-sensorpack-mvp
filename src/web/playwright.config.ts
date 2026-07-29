import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * Playwright E2E configuration (Issue #25, requirements.md 1.6 F1/F5/F6/F7/F8
 * and .claude/rules/testing.md "Playwright — 実ブラウザでのE2E(ログイン・画面
 * 遷移などの主要導線)").
 *
 * Edit scope note: Issue #25's stated edit scope is `src/web/e2e/**` (new).
 * This config file, the `test:e2e`/`pretest:e2e` package.json scripts, and
 * the `testPathIgnorePatterns` addition in jest.config.js are the minimal
 * unavoidable exceptions — Playwright cannot be wired up without a runner
 * config and a way to keep Jest from also trying to execute `*.spec.ts`
 * files under e2e/. No screen/component/page source file is touched by this
 * change (see the PR description for the full file list).
 *
 * --- Why `next start` (a production build) instead of `next dev` ---
 * This was not the original plan; it is the result of an investigation
 * recorded here for the next person who touches this file. Under `next dev`
 * (both Turbopack, the default, and `--webpack`), every client component in
 * this app consistently failed to hydrate when driven by Playwright in this
 * project's sandboxed dev-container: SSR markup rendered correctly, but
 * `useEffect` bodies never ran (verified via console.debug tracing already
 * present in e.g. AlertsView) and click handlers never fired, even after
 * 20+ second waits. The dev server's HMR client repeatedly failed its
 * WebSocket handshake (`net::ERR_INVALID_HTTP_RESPONSE`) in this sandbox,
 * and — independent of whether that is the actual cause — the same
 * component tree hydrates and responds to interaction correctly the moment
 * the identical code is served via `next build && next start` instead. This
 * is treated as a characteristic of `next dev` in this environment (not an
 * application defect: no source file needed to change), so this suite
 * builds once (`pretest:e2e` → `next build`) and drives two independent
 * `next start` processes against that single build, differing only in the
 * `APP_ENV` each is started with.
 *
 * One consequence documented in e2e/README.md and the PR description: the
 * dev-only auto-auth bypass (lib/auth/devAutoAuth.ts) re-checks
 * `isDevAutoAuthEnabled()` client-side as defense-in-depth, and that check
 * reads `process.env.NODE_ENV`, which Next.js inlines into the client
 * bundle at `next build` time — always "production" for any built bundle,
 * regardless of the `APP_ENV` the resulting server is later started with.
 * So this suite can verify (via SSR output alone, no hydration required)
 * that the bypass button is rendered only when `APP_ENV=development` and
 * never when `APP_ENV=production` (the fail-closed guarantee
 * .claude/rules/environment.md requires), but cannot exercise a successful
 * end-to-end "click it and land on the home page" against a built bundle —
 * that inherently requires a real `next dev` process, which does not
 * hydrate in this sandbox. See e2e/login.spec.ts for the precise scope this
 * lands on.
 */
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

const DEV_PORT = 4300;
const PRODUCTION_ENVIRONMENT_PORT = 4301;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      // The primary journey suite: home → login screen → dashboard → device
      // detail → device claim → alerts → control → summary. Runs against a
      // server started with APP_ENV=development (the only environment where
      // the dev-auto-auth bypass button is rendered at all).
      name: 'primary-flows',
      testDir: './e2e',
      testIgnore: ['**/environment-production.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${DEV_PORT}` },
    },
    {
      // .claude/rules/environment.md: "環境判定がproductionの場合、この分岐
      // は絶対に到達不可能でなければならない". This project runs against a
      // second, independent `next start` process (same build, different
      // APP_ENV) so the fail-closed guarantee is checked against the same
      // server-rendered HTML a real deployment would produce.
      name: 'production-environment-guard',
      testDir: './e2e',
      testMatch: ['**/environment-production.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PRODUCTION_ENVIRONMENT_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx next start -p ${DEV_PORT}`,
      port: DEV_PORT,
      cwd: __dirname,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        APP_ENV: 'development',
        BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL ?? 'http://127.0.0.1:9',
      },
    },
    {
      command: `npx next start -p ${PRODUCTION_ENVIRONMENT_PORT}`,
      port: PRODUCTION_ENVIRONMENT_PORT,
      cwd: __dirname,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        APP_ENV: 'production',
        BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL ?? 'http://127.0.0.1:9',
      },
    },
  ],
});
