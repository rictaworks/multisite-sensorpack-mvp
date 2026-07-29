import { expect, test } from '@playwright/test';
import { t } from './support/messages';

/**
 * .claude/rules/environment.md: "環境判定がproductionの場合、この分岐は絶対
 * に到達不可能でなければならない(fail closed)" and "本番のUIに、この開発用
 * 近道(スキップログインボタン等)を一切表示・露出しない".
 *
 * Runs against the `production-environment-guard` Playwright project, a
 * second `next start` process serving the exact same build as the
 * `primary-flows` project but started with `APP_ENV=production` (see
 * playwright.config.ts). Because `isDevAutoAuthEnabled()` — and therefore
 * whether LoginView renders the bypass button at all — is computed
 * server-side, per request (app/[locale]/(auth)/login/page.tsx is a
 * dynamic route, not statically prerendered, confirmed via `next build`
 * output), this test observes the real server-rendered HTML a production
 * deployment started with APP_ENV=production would actually send, not a
 * client-side approximation of it.
 */
test.describe('本番相当環境(APP_ENV=production)でのログイン画面', () => {
  test('開発用バイパスボタンは一切描画されない', async ({ page }) => {
    await page.goto('/ja/login');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'login.title') })).toBeVisible();
    await expect(page.getByRole('button', { name: t('ja', 'login.devBypass') })).toHaveCount(0);
    // Not just invisible — genuinely absent from the DOM (no hidden-but-present
    // node a user could reveal via devtools), matching "一切表示・露出しない".
    await expect(page.locator('body')).not.toContainText(t('ja', 'login.devBypass'));
  });

  test('一般消費者向けのGoogleログイン導線は本番でも利用できる', async ({ page }) => {
    await page.goto('/ja/login');

    // The one and only actionable sign-in control must still be present:
    // production must not lose the real login path just because the dev
    // shortcut is correctly suppressed.
    await expect(
      page.getByRole('button', { name: t('ja', 'login.googleButton'), disabled: true })
    ).toBeVisible();
  });
});
