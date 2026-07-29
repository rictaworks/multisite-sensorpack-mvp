import type { Page } from '@playwright/test';

/**
 * F8 お知らせ(アラート)画面が呼ぶRails APIを、Playwrightのネットワーク層でスタブする。
 *
 * この画面は components/alerts/alertsRepository.ts のインメモリのモックを抱えるのをやめ、
 * 実API(`GET /alerts` / `POST /alerts/{id}/ack`)へ結線した。
 *
 * このスイートはRailsの起動に依存しない方針のため、claimApiStub.ts / dashboardApiStub.ts と
 * 同じくブラウザのネットワーク層で応答を差し替える。これはE2Eテストの一般的な手法であり、
 * アプリケーション側のフォールバックではない: src/web のソースは一切変更されず、
 * 取得・ack・タブ集計・バッジ更新はすべて実物のコンポーネントロジックが動く。
 *
 * ack は「サーバー側の状態が実際に変わる」ことを再現するため、このスタブ内で状態を持つ
 * (ack後に一覧を引き直しても確認ずみのままになる)。状態はページごとのクロージャに閉じ込め、
 * モジュールスコープには置かない(.claude/rules/coding-style.md: グローバル変数禁止)。
 */

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** 未対応2・確認ずみ1・解決ずみ1（E2Eのタブ件数・バッジ件数の期待値の根拠）。 */
function seedAlerts() {
  return [
    { id: 1, deviceId: 1, alertType: 'upper_breach', severity: 'warning', status: 'open', openedAt: minutesAgoIso(12), acknowledgedAt: null, closedAt: null },
    { id: 2, deviceId: 2, alertType: 'offline', severity: 'critical', status: 'open', openedAt: minutesAgoIso(47), acknowledgedAt: null, closedAt: null },
    { id: 3, deviceId: 2, alertType: 'upper_breach', severity: 'warning', status: 'acknowledged', openedAt: minutesAgoIso(90), acknowledgedAt: minutesAgoIso(30), closedAt: null },
    { id: 4, deviceId: 1, alertType: 'lower_breach', severity: 'info', status: 'closed', openedAt: minutesAgoIso(320), acknowledgedAt: null, closedAt: minutesAgoIso(60) },
  ];
}

export async function stubAlertsApi(page: Page): Promise<void> {
  const alerts = seedAlerts();

  await page.route('**/api/v1/alerts/*/ack', async (route) => {
    const alertId = Number(route.request().url().split('/').at(-2));
    const target = alerts.find((alert) => alert.id === alertId);

    if (!target) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
      });
      return;
    }

    // requirements.md F8.2: ack できるのは open のみ。closed は自動解決でしか到達しない。
    if (target.status === 'closed') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'alert_already_closed', message: 'Already closed' } }),
      });
      return;
    }

    target.status = 'acknowledged';
    target.acknowledgedAt = new Date().toISOString();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(target) });
  });

  await page.route('**/api/v1/alerts?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ alerts }) });
  });
}
