import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';
import { STUB_TOTALS, stubDashboardApi } from './support/dashboardApiStub';

/**
 * F6 ダッシュボード(拠点一覧・デバイス詳細・時系列グラフ) — Issue #18.
 *
 * この画面は実API(`GET /dashboard/sites-summary`・`/devices`・`/devices/{id}` ほか)へ
 * 結線しており、かつて読んでいた lib/dashboard/mockData.ts のスタブは撤去した。
 * このスイートはRailsの起動に依存しない方針のため、応答は
 * support/dashboardApiStub.ts がブラウザのネットワーク層で差し替える
 * (アプリ側のフォールバックではない。コンポーネントの取得・状態遷移・描画は実物が動く)。
 *
 * 画面遷移は実物である(SitesOverviewはnext-intlのロケール対応`<Link>`でデバイス詳細へ遷移する。
 * このスイートの他画面のような`page.goto()`ではなく、実際に機能するアプリ内リンク)。
 *
 * No auth guard exists on /dashboard yet (confirmed: no requireSession/
 * redirect anywhere in app/[locale]/dashboard/**; every prior WORK report
 * for issues #18/#20/#21/#22 records this as a residual "ログイン導線実装後
 * にガード追加が必要" item), so this test reaches it directly.
 */

test.describe('拠点のようす(ダッシュボード)', () => {
  test.beforeEach(async ({ page }) => {
    await stubDashboardApi(page);
  });

  test('拠点一覧の集計値と拠点カードが表示される', async ({ page }) => {
    await page.goto('/ja/dashboard');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'dashboard.overview.title') })).toBeVisible();

    // 期待値の根拠は support/dashboardApiStub.ts の固定応答(拠点2・デバイス3・
    // オンライン1・未対応アラート2)。値の重複を避けるためスタブ側から導出する。
    await expect(page.getByTestId('stat-sites-value')).toHaveText(String(STUB_TOTALS.sites));
    await expect(page.getByTestId('stat-devices-value')).toHaveText(String(STUB_TOTALS.devices));
    await expect(page.getByTestId('stat-online-value')).toHaveText(String(STUB_TOTALS.online));
    await expect(page.getByTestId('stat-open-alerts-value')).toHaveText(String(STUB_TOTALS.openAlerts));

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
