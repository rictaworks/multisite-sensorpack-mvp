import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';

/**
 * F6 ダッシュボード(拠点一覧・デバイス詳細・時系列グラフ) — Issue #18.
 *
 * lib/dashboard/mockData.ts is a deterministic, contract-shaped in-memory
 * stub (no network call at all — see the WORK/2026-07-28-issue-18-dashboard.md
 * residual-gap note: real Rails wiring is a later issue). This is therefore
 * a genuine E2E of the real component tree and its real navigation
 * (SitesOverview uses next-intl's locale-aware `<Link>` to the device detail
 * page — an actual working in-app link, unlike the home→login/alerts/
 * control/summary transitions noted elsewhere in this suite), just against
 * fixture data instead of a live backend.
 *
 * No auth guard exists on /dashboard yet (confirmed: no requireSession/
 * redirect anywhere in app/[locale]/dashboard/**; every prior WORK report
 * for issues #18/#20/#21/#22 records this as a residual "ログイン導線実装後
 * にガード追加が必要" item), so this test reaches it directly.
 */

test.describe('拠点のようす(ダッシュボード)', () => {
  test('拠点一覧の集計値と拠点カードが表示される', async ({ page }) => {
    await page.goto('/ja/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'dashboard.overview.title') })).toBeVisible();

    // Fixture totals from lib/dashboard/mockData.ts: 2 sites (倉庫A/実家),
    // 3 devices total (1 online site1 device + 2 site2 devices), 1 online,
    // 2 open alerts (one per site).
    await expect(page.getByTestId('stat-sites-value')).toHaveText('2');
    await expect(page.getByTestId('stat-devices-value')).toHaveText('3');
    await expect(page.getByTestId('stat-online-value')).toHaveText('1');
    await expect(page.getByTestId('stat-open-alerts-value')).toHaveText('2');

    const warehouseCard = page.getByTestId('site-card-1');
    await expect(warehouseCard).toContainText('倉庫A');
    const homeCard = page.getByTestId('site-card-2');
    await expect(homeCard).toContainText('実家');
  });

  test('デバイス行のリンクからデバイス詳細画面に遷移し、24h/7日間を切り替えられる', async ({ page }) => {
    await page.goto('/ja/dashboard');

    const deviceLabel = interpolate(t('ja', 'dashboard.overview.deviceLabel'), { id: 1 });
    await page.getByTestId('site-card-1').getByRole('link', { name: new RegExp(deviceLabel) }).click();

    await expect(page).toHaveURL(/\/ja\/dashboard\/1$/);
    await expect(page.getByRole('heading', { level: 1, name: deviceLabel })).toBeVisible();

    const range24h = page.getByRole('button', { name: t('ja', 'dashboard.device.range24h') });
    const range7d = page.getByRole('button', { name: t('ja', 'dashboard.device.range7d') });
    await expect(range24h).toHaveAttribute('aria-pressed', 'true');
    await expect(range7d).toHaveAttribute('aria-pressed', 'false');

    await range7d.click();
    await expect(range7d).toHaveAttribute('aria-pressed', 'true');
    await expect(range24h).toHaveAttribute('aria-pressed', 'false');

    // Command/alert history sections render (may legitimately be empty for
    // some devices; this just confirms the sections themselves mount).
    await expect(page.getByTestId('command-history')).toBeVisible();
    await expect(page.getByTestId('alert-history')).toBeVisible();

    await page.getByRole('link', { name: t('ja', 'dashboard.device.backToOverview') }).click();
    await expect(page).toHaveURL(/\/ja\/dashboard$/);
  });
});
