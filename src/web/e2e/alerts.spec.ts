import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';
import { stubAlertsApi } from './support/alertsApiStub';

/**
 * F8 お知らせ(アラート)一覧・ack UI — Issue #20.
 *
 * この画面は実API(`GET /alerts` / `POST /alerts/{id}/ack`)へ結線しており、かつて
 * 抱えていたインメモリのモック(alertsRepository.ts)は撤去した。
 * このスイートはRailsの起動に依存しない方針のため、応答は support/alertsApiStub.ts が
 * ブラウザのネットワーク層で差し替える(アプリ側のフォールバックではない)。
 * ackボタン・タブ件数・バッジ更新はすべて実物のコンポーネントロジックが動く。
 */
test.describe('お知らせ(アラート)一覧・ack', () => {
  test.beforeEach(async ({ page }) => {
    await stubAlertsApi(page);
  });

  test('未対応アラートをackすると、確認ずみタブに移動しバッジ件数が減る', async ({ page }) => {
    await page.goto('/ja/alerts');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'alerts.title') })).toBeVisible();

    const badge = page.getByRole('status', {
      name: interpolate(t('ja', 'alerts.badgeAriaLabel'), { count: 2 }),
    });
    await expect(badge).toBeVisible();

    const openTabLabel = interpolate(t('ja', 'alerts.tabLabelWithCount'), {
      label: t('ja', 'alerts.tabs.open'),
      count: 2,
    });
    const acknowledgedTabLabelBefore = interpolate(t('ja', 'alerts.tabLabelWithCount'), {
      label: t('ja', 'alerts.tabs.acknowledged'),
      count: 1,
    });
    await expect(page.getByRole('button', { name: openTabLabel })).toBeVisible();
    await expect(page.getByRole('button', { name: acknowledgedTabLabelBefore })).toBeVisible();

    const ackButtons = page.getByRole('button', { name: t('ja', 'alerts.ackButton') });
    await expect(ackButtons).toHaveCount(2);
    await ackButtons.first().click();

    await expect(ackButtons).toHaveCount(1);

    const openTabLabelAfter = interpolate(t('ja', 'alerts.tabLabelWithCount'), {
      label: t('ja', 'alerts.tabs.open'),
      count: 1,
    });
    const acknowledgedTabLabelAfter = interpolate(t('ja', 'alerts.tabLabelWithCount'), {
      label: t('ja', 'alerts.tabs.acknowledged'),
      count: 2,
    });
    await expect(page.getByRole('button', { name: openTabLabelAfter })).toBeVisible();
    await expect(page.getByRole('button', { name: acknowledgedTabLabelAfter })).toBeVisible();

    const badgeAfter = page.getByRole('status', {
      name: interpolate(t('ja', 'alerts.badgeAriaLabel'), { count: 1 }),
    });
    await expect(badgeAfter).toBeVisible();
  });

  test('解決ずみタブにはackボタンが表示されない(自分で解決ずみにはできない)', async ({ page }) => {
    await page.goto('/ja/alerts');

    const closedTabLabel = interpolate(t('ja', 'alerts.tabLabelWithCount'), {
      label: t('ja', 'alerts.tabs.closed'),
      count: 1,
    });
    await page.getByRole('button', { name: closedTabLabel }).click();

    await expect(page.getByRole('button', { name: t('ja', 'alerts.ackButton') })).toHaveCount(0);
    await expect(page.getByText(t('ja', 'alerts.footerNote'))).toBeVisible();
  });
});
