import {
  dispatchCommand,
  fetchControlDevices,
  updateAutomationRule,
} from '../../components/control/controlApi';
import { ApiError } from '../../lib/api/apiClient';

/**
 * F5 運用ツール画面のAPIクライアント。
 * かつての components/control/mockControlApi.ts（タイマーで状態遷移を擬似再現するモック）を
 * 置き換えたもの。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    deviceId: 1,
    commandType: 'LED_ON',
    idempotencyKey: '00000000-0000-4000-8000-000000000000',
    origin: 'manual',
    status: 'done',
    issuedAt: '2026-07-29T00:00:00.000Z',
    expiresAt: '2026-07-29T00:10:00.000Z',
    ...overrides,
  };
}

/** パスごとに応答を返すfetchのスタブ。 */
function routedFetch(routes: Record<string, unknown>): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    const path = url.replace('/api/v1', '');
    const match = Object.keys(routes).find((route) => path === route);
    if (!match) {
      throw new Error(`unexpected request to ${url}`);
    }
    return Promise.resolve(jsonResponse(routes[match]));
  });
}

const BASE_ROUTES = {
  '/devices': { devices: [{ id: 1, siteId: 7, status: 'online' }] },
  '/dashboard/sites-summary': { sites: [{ id: 7, name: '倉庫A' }] },
  '/devices/1/commands': { commands: [] },
  '/devices/1/automation-rule': { fanOnTempAlert: true, ledOnAlert: false, manualOverrideUntil: null },
};

describe('control/controlApi', () => {
  describe('fetchControlDevices', () => {
    it('デバイス・拠点名・コマンド履歴・自動ルールを1台ぶんにまとめる', async () => {
      const fetchImpl = routedFetch(BASE_ROUTES);

      const devices = await fetchControlDevices(fetchImpl);

      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({
        id: 1,
        siteName: '倉庫A',
        status: 'online',
        automationRule: { fanOnTempAlert: true, ledOnAlert: false },
      });
    });

    // 契約にアクチュエータの現在状態を持つフィールドは無い。実機の物理状態は分からないため、
    // 「最後に発行され、失効していないコマンド」から導出する以上のことを装わない。
    it('直近のコマンドからLED/ファンのON状態を導出する', async () => {
      const fetchImpl = routedFetch({
        ...BASE_ROUTES,
        '/devices/1/commands': {
          commands: [
            command({ id: 3, commandType: 'LED_ON', issuedAt: '2026-07-29T02:00:00.000Z' }),
            command({ id: 2, commandType: 'LED_OFF', issuedAt: '2026-07-29T01:00:00.000Z' }),
            command({ id: 1, commandType: 'FAN_ON', issuedAt: '2026-07-29T00:00:00.000Z' }),
          ],
        },
      });

      const [device] = await fetchControlDevices(fetchImpl);

      expect(device.ledOn).toBe(true);
      expect(device.fanOn).toBe(true);
    });

    it('最新がOFFコマンドならOFFとして扱う', async () => {
      const fetchImpl = routedFetch({
        ...BASE_ROUTES,
        '/devices/1/commands': {
          commands: [
            command({ id: 2, commandType: 'LED_OFF', issuedAt: '2026-07-29T02:00:00.000Z' }),
            command({ id: 1, commandType: 'LED_ON', issuedAt: '2026-07-29T01:00:00.000Z' }),
          ],
        },
      });

      const [device] = await fetchControlDevices(fetchImpl);

      expect(device.ledOn).toBe(false);
    });

    // 失効した(expired)コマンドは届かなかったので、状態に反映してはいけない。
    it('失効したコマンドは状態に反映しない', async () => {
      const fetchImpl = routedFetch({
        ...BASE_ROUTES,
        '/devices/1/commands': {
          commands: [
            command({ id: 2, commandType: 'LED_ON', status: 'expired', issuedAt: '2026-07-29T02:00:00.000Z' }),
            command({ id: 1, commandType: 'LED_OFF', status: 'done', issuedAt: '2026-07-29T01:00:00.000Z' }),
          ],
        },
      });

      const [device] = await fetchControlDevices(fetchImpl);

      expect(device.ledOn).toBe(false);
    });

    it('コマンド履歴が無い場合は両方OFFとして扱う', async () => {
      const fetchImpl = routedFetch(BASE_ROUTES);

      const [device] = await fetchControlDevices(fetchImpl);

      expect(device.ledOn).toBe(false);
      expect(device.fanOn).toBe(false);
    });
  });

  describe('dispatchCommand', () => {
    it('コマンド種別をPOSTする', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(command({ status: 'pending' }), 201));

      const result = await dispatchCommand(1, 'FAN_ON', fetchImpl);

      expect(result).toMatchObject({ status: 'pending' });
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('/api/v1/devices/1/commands');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ commandType: 'FAN_ON' });
    });

    it('失敗を握りつぶさず例外として伝える', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: 'forbidden' } }, 403));

      await expect(dispatchCommand(1, 'FAN_ON', fetchImpl)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('updateAutomationRule', () => {
    // 変更していないフィールドまで送ると、サーバー側で意図しない上書きが起きうる。
    it('変更したフィールドだけをPUTする', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ fanOnTempAlert: false, ledOnAlert: true, manualOverrideUntil: null }));

      await updateAutomationRule(1, { fanOnTempAlert: false }, fetchImpl);

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('/api/v1/devices/1/automation-rule');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({ fanOnTempAlert: false });
    });
  });
});
