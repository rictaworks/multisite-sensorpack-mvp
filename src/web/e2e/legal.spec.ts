import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';

/**
 * 利用規約・プライバシーポリシー — Issue #70（`.claude/CC.md` CC03/CC04/CC08）。
 *
 * どちらの画面もサーバーからの取得を伴わない静的な文書のため、スタブは不要。
 * ログイン画面からの到達性（CC03/CC04が求める導線）を実際のクリックで検証する。
 */
test.describe('利用規約・プライバシーポリシー', () => {
  test('ログイン画面から利用規約へ遷移でき、監修前である旨が表示される', async ({ page }) => {
    await page.goto('/ja/login');

    await page.getByRole('link', { name: t('ja', 'legal.termsLink') }).click();

    await expect(page).toHaveURL(/\/ja\/legal\/terms$/);
    await expect(
      page.getByRole('heading', { level: 1, name: t('ja', 'legal.terms.title') })
    ).toBeVisible();
    await expect(page.getByText(t('ja', 'legal.draftNotice'))).toBeVisible();
    await expect(page.getByText(t('ja', 'legal.terms.disclaimerBody'))).toBeVisible();

    await page.getByRole('link', { name: t('ja', 'legal.backToLogin') }).click();
    await expect(page).toHaveURL(/\/ja\/login$/);
  });

  test('ログイン画面からプライバシーポリシーへ遷移でき、取得しない情報とCookieの用途が読める', async ({
    page,
  }) => {
    await page.goto('/ja/login');

    await page.getByRole('link', { name: t('ja', 'legal.privacyLink') }).click();

    await expect(page).toHaveURL(/\/ja\/legal\/privacy$/);
    await expect(page.getByText(t('ja', 'legal.privacy.notCollectedBody'))).toBeVisible();
    await expect(page.getByText(t('ja', 'legal.privacy.cookiesBody'))).toBeVisible();
  });

  test('英語ロケールでも同じ文書が表示される(7言語対応)', async ({ page }) => {
    await page.goto('/en/legal/privacy');

    await expect(
      page.getByRole('heading', { level: 1, name: t('en', 'legal.privacy.title') })
    ).toBeVisible();
    await expect(
      page.getByText(interpolate(t('en', 'legal.lastUpdated'), { date: '2026-07-29' }))
    ).toBeVisible();
  });
});
