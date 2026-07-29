import type { Page } from '@playwright/test';

/**
 * F5 運用ツール画面が呼ぶRails APIを、Playwrightのネットワーク層でスタブする。
 *
 * この画面は components/control/mockControlApi.ts（pending→delivered→done をタイマーで
 * 擬似再現するモック）を撤去し、実API（`GET /devices`・`/devices/{id}/commands`・
 * `/devices/{id}/automation-rule`、`POST /devices/{id}/commands`、
 * `PUT /devices/{id}/automation-rule`）へ結線した。
 *
 * このスイートはRailsの起動に依存しない方針のため、他のスタブと同じくブラウザの
 * ネットワーク層で応答を差し替える。アプリ側のフォールバックではない。
 *
 * 実運用では pending → delivered → done の遷移はデバイスのACK（ピギーバック）で進むが、
 * このスタブでは発行したコマンドを done として保持する。E2Eで確認したいのは
 * 「確認ダイアログを経て発行され、その結果が画面に反映されること」であり、
 * デバイス側の挙動ではないため。状態はページごとのクロージャに閉じ込める。
 */

const ONLINE_DEVICE_ID = 1;
const OFFLINE_DEVICE_ID = 2;

export const CONTROL_DEVICE_IDS = { online: ONLINE_DEVICE_ID, offline: OFFLINE_DEVICE_ID };

export async function stubControlApi(page: Page): Promise<void> {
  const commandsByDeviceId = new Map<number, Array<Record<string, unknown>>>([
    [ONLINE_DEVICE_ID, []],
    [OFFLINE_DEVICE_ID, []],
  ]);
  const rulesByDeviceId = new Map<number, Record<string, unknown>>([
    [ONLINE_DEVICE_ID, { fanOnTempAlert: true, ledOnAlert: true, manualOverrideUntil: null }],
    [OFFLINE_DEVICE_ID, { fanOnTempAlert: false, ledOnAlert: true, manualOverrideUntil: null }],
  ]);

  function deviceIdFrom(url: string): number {
    return Number(new URL(url).pathname.split('/').at(-2));
  }

  await page.route('**/api/v1/dashboard/sites-summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sites: [
          { id: 7, name: '倉庫A', deviceCount: 1, onlineDeviceCount: 1, openAlertCount: 0, createdAt: '2026-07-01T00:00:00.000Z' },
          { id: 8, name: '実家', deviceCount: 1, onlineDeviceCount: 0, openAlertCount: 0, createdAt: '2026-07-01T00:00:00.000Z' },
        ],
      }),
    });
  });

  await page.route('**/api/v1/devices', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        devices: [
          { id: ONLINE_DEVICE_ID, siteId: 7, status: 'online', lastSeenAt: '2026-07-29T00:00:00.000Z', expectedIntervalSec: 60, createdAt: '2026-07-01T00:00:00.000Z' },
          { id: OFFLINE_DEVICE_ID, siteId: 8, status: 'offline', lastSeenAt: null, expectedIntervalSec: 60, createdAt: '2026-07-01T00:00:00.000Z' },
        ],
      }),
    });
  });

  await page.route('**/api/v1/devices/*/commands', async (route) => {
    const deviceId = deviceIdFrom(route.request().url());
    const commands = commandsByDeviceId.get(deviceId) ?? [];

    if (route.request().method() === 'POST') {
      const { commandType } = route.request().postDataJSON() as { commandType: string };
      const issuedAt = new Date().toISOString();
      const created = {
        id: commands.length + 1,
        deviceId,
        commandType,
        idempotencyKey: `00000000-0000-4000-8000-00000000000${commands.length + 1}`,
        origin: 'manual',
        status: 'done',
        issuedAt,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      commands.unshift(created);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ commands }) });
  });

  await page.route('**/api/v1/devices/*/automation-rule', async (route) => {
    const deviceId = deviceIdFrom(route.request().url());
    const rule = rulesByDeviceId.get(deviceId) ?? {};

    if (route.request().method() === 'PUT') {
      Object.assign(rule, route.request().postDataJSON() as Record<string, unknown>);
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rule) });
  });
}
