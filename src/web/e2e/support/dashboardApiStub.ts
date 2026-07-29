import type { Page } from '@playwright/test';

/**
 * F6 ダッシュボードが呼ぶRails APIを、Playwrightのネットワーク層でスタブする。
 *
 * この画面は lib/dashboard/mockData.ts のスタブを直接読むのをやめ、実API
 * (`GET /dashboard/sites-summary`・`/devices`・`/devices/{id}`・`/telemetry-series`・
 * `/commands`・`/alerts`)へ結線した。リクエストはNext.jsのサーバー側プロキシ
 * (app/api/v1/[...path]/route.ts)を経由してRailsへ届く。
 *
 * このスイートはRailsの起動に依存しない方針のため、claimApiStub.ts と同じく
 * ブラウザのネットワーク層で応答を差し替える。これはE2Eテストの一般的な手法
 * (テスト分離のためのネットワーク傍受)であり、アプリケーション側のフォールバックではない:
 * src/web のソースは一切変更されず、コンポーネントの取得・状態遷移・描画は
 * このスタブ応答に対してそのまま実行される。
 *
 * 固定値は requirements.md 1.8 の最小テスト構成(ユーザー2/拠点2/デバイス2)に合わせている。
 */

const SITES = [
  {
    id: 1,
    name: '倉庫A',
    deviceCount: 2,
    onlineDeviceCount: 1,
    openAlertCount: 1,
    latestTemperatureC: 23.4,
    latestHumidityPct: 55,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '実家',
    deviceCount: 1,
    onlineDeviceCount: 0,
    openAlertCount: 1,
    latestTemperatureC: 19.8,
    latestHumidityPct: 61,
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

const DEVICES = [
  { id: 1, siteId: 1, status: 'online', lastSeenAt: '2026-07-29T00:00:00.000Z', expectedIntervalSec: 60, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 2, siteId: 1, status: 'offline', lastSeenAt: '2026-07-28T00:00:00.000Z', expectedIntervalSec: 60, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 3, siteId: 2, status: 'offline', lastSeenAt: null, expectedIntervalSec: 60, createdAt: '2026-07-01T00:00:00.000Z' },
];

/** 拠点2件・デバイス3件・オンライン1件・未対応アラート2件（E2Eの期待値の根拠）。 */
export const STUB_TOTALS = {
  sites: SITES.length,
  devices: SITES.reduce((sum, site) => sum + site.deviceCount, 0),
  online: SITES.reduce((sum, site) => sum + site.onlineDeviceCount, 0),
  openAlerts: SITES.reduce((sum, site) => sum + site.openAlertCount, 0),
};

function telemetrySeries(sensorType: string) {
  // 6点あれば折れ線・閾値ライン・集計値の描画を確認できる。
  const points = Array.from({ length: 6 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 6, 29, index, 0, 0)).toISOString(),
    temperatureC: sensorType === 'temperature' ? 21 + index * 0.5 : null,
    humidityPct: sensorType === 'humidity' ? 50 + index : null,
    isAggregated: false,
  }));

  return {
    points,
    thresholds: [
      { sensorType: 'temperature', upperLimit: 28, lowerLimit: 5, hysteresis: 1 },
    ],
  };
}

/** ダッシュボード（拠点一覧・デバイス詳細）が呼ぶ参照系エンドポイントを一括でスタブする。 */
export async function stubDashboardApi(page: Page): Promise<void> {
  await page.route('**/api/v1/dashboard/sites-summary', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sites: SITES }) });
  });

  await page.route('**/api/v1/devices?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: DEVICES }) });
  });
  await page.route('**/api/v1/devices', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: DEVICES }) });
  });

  await page.route('**/api/v1/devices/*/telemetry-series*', async (route) => {
    const sensorType = new URL(route.request().url()).searchParams.get('sensorType') ?? 'temperature';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(telemetrySeries(sensorType)) });
  });

  await page.route('**/api/v1/devices/*/commands', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        commands: [
          {
            id: 1,
            deviceId: 1,
            commandType: 'LED_ON',
            origin: 'manual',
            status: 'done',
            issuedAt: '2026-07-29T00:00:00.000Z',
            expiresAt: '2026-07-29T00:10:00.000Z',
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/alerts*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          {
            id: 1,
            deviceId: 1,
            alertType: 'upper_breach',
            severity: 'warning',
            status: 'open',
            openedAt: '2026-07-29T00:00:00.000Z',
            acknowledgedAt: null,
            closedAt: null,
          },
        ],
      }),
    });
  });

  // デバイス詳細本体。上のより具体的なパターン（/commands 等）に一致しなかった
  // `/devices/{id}` だけがここへ来る。
  await page.route('**/api/v1/devices/*', async (route) => {
    const deviceId = Number(new URL(route.request().url()).pathname.split('/').pop());
    const device = DEVICES.find((candidate) => candidate.id === deviceId);

    if (!device) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...device, thresholds: telemetrySeries('temperature').thresholds, automationRule: null }),
    });
  });
}
