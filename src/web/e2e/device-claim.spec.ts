import { expect, test } from '@playwright/test';
import { t } from './support/messages';
import { passTestRecaptcha } from './support/recaptcha';
import {
  STUB_SITES,
  stubClaimCodeRateLimited,
  stubClaimCodeSuccess,
  stubEmptySitesList,
  stubSitesList,
} from './support/claimApiStub';

/**
 * F1 デバイス登録(クレームコード発行) — Issue #19.
 *
 * Unlike alerts/control/summary, components/claim/api.ts makes *real* fetch
 * calls to `/api/v1/sites` and `/api/v1/claim-codes` — there is no
 * in-memory mock here to fall back on client-side. Per the Issue #25 work
 * instructions, since the Rails backend behind those same-origin paths is
 * not wired up in this repository yet (every WORK/ report since #19 records
 * this as a residual gap), this file stubs those two requests at the
 * Playwright network layer (see e2e/support/claimApiStub.ts for why that is
 * a legitimate E2E-test technique here, not an application fallback) so the
 * real DeviceClaimView UI/validation logic can still be exercised end to
 * end.
 */
test.describe('デバイス登録(クレームコード発行)', () => {
  test('拠点が0件のとき、未入力のまま送信すると各項目のバリデーションエラーが表示される', async ({ page }) => {
    await stubEmptySitesList(page);
    await page.goto('/ja/devices/claim');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'deviceClaim.title') })).toBeVisible();
    await expect(page.getByText(t('ja', 'deviceClaim.form.siteEmpty'))).toBeVisible();

    await page.getByRole('button', { name: t('ja', 'deviceClaim.form.submit') }).click();

    await expect(page.getByText(t('ja', 'deviceClaim.errors.siteRequired'))).toBeVisible();
    await expect(page.getByText(t('ja', 'deviceClaim.errors.nameRequired'))).toBeVisible();
    await expect(page.getByText(t('ja', 'deviceClaim.errors.recaptchaRequired'))).toBeVisible();
  });

  test('拠点選択・呼び名入力・reCAPTCHA通過後に送信すると8桁のクレームコードと有効期限が表示される', async ({
    page,
  }) => {
    await stubSitesList(page);
    await stubClaimCodeSuccess(page, 'WXYZ7890');
    await page.goto('/ja/devices/claim');

    // The first site is auto-selected on load; explicitly picking the
    // second one both exercises the site-picker interaction and avoids
    // depending on that auto-select default.
    const secondSite = STUB_SITES[1];
    const siteButton = page.getByRole('button', { name: secondSite.name, exact: true });
    await siteButton.click();
    await expect(siteButton).toHaveAttribute('aria-pressed', 'true');

    await page.getByLabel(t('ja', 'deviceClaim.form.nameLabel')).fill('倉庫A 奥の棚');

    await passTestRecaptcha(page);

    await page.getByRole('button', { name: t('ja', 'deviceClaim.form.submit') }).click();

    const issuedSection = page.getByTestId('claim-issued');
    await expect(issuedSection).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('claim-code')).toHaveText('WXYZ7890');
    await expect(issuedSection).toContainText(t('ja', 'deviceClaim.issued.instructions'));
  });

  test('reCAPTCHA検証やレート制限で発行が拒否された場合はエラーメッセージが表示される', async ({ page }) => {
    await stubSitesList(page);
    await stubClaimCodeRateLimited(page);
    await page.goto('/ja/devices/claim');

    await page.getByLabel(t('ja', 'deviceClaim.form.nameLabel')).fill('実家 玄関');
    await passTestRecaptcha(page);
    await page.getByRole('button', { name: t('ja', 'deviceClaim.form.submit') }).click();

    await expect(page.getByText(t('ja', 'deviceClaim.errors.rateLimited'))).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('claim-issued')).toHaveCount(0);
  });
});
