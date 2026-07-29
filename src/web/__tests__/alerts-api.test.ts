import { AlertNotAcknowledgeableError, acknowledgeAlert, listAlerts } from '../components/alerts/alertsApi';
import { ApiError } from '../lib/api/apiClient';

/**
 * F8 アラートのAPIクライアント（openapi.yaml listAlerts / acknowledgeAlert）。
 * かつてのインメモリのモック（alertsRepository.ts）を置き換えたもの。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

const OPEN_ALERT = {
  id: 1,
  deviceId: 1,
  alertType: 'upper_breach',
  severity: 'warning',
  status: 'open',
  openedAt: '2026-07-29T00:00:00.000Z',
  acknowledgedAt: null,
  closedAt: null,
};

describe('alerts/alertsApi', () => {
  describe('listAlerts', () => {
    // APIの既定は closed を返さない。画面には解決ずみタブがあるため、
    // 明示しないと「解決ずみ(0)」と表示されてしまう。
    it('3状態すべてを明示して1回で取得する', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ alerts: [OPEN_ALERT] }));

      const alerts = await listAlerts(undefined, fetchImpl);

      expect(alerts).toEqual([OPEN_ALERT]);
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/alerts?status=open,acknowledged,closed');
      expect(fetchImpl.mock.calls[0][1]).toEqual(
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    it('状態を指定した場合はその状態だけを要求する', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ alerts: [] }));

      await listAlerts(['open'], fetchImpl);

      expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/alerts?status=open');
    });

    it('通信に失敗した場合は空配列にフォールバックせず例外を投げる', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(listAlerts(undefined, fetchImpl)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('acknowledgeAlert', () => {
    it('ackを送り、サーバーが返した更新後のアラートをそのまま返す', async () => {
      const acknowledged = { ...OPEN_ALERT, status: 'acknowledged', acknowledgedAt: '2026-07-29T00:05:00.000Z' };
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(acknowledged));

      const result = await acknowledgeAlert(1, fetchImpl);

      expect(result).toEqual(acknowledged);
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/alerts/1/ack');
      expect(fetchImpl.mock.calls[0][1]).toEqual(
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });

    it('404は「見つからない」として区別できる例外に翻訳する', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'not found' } }, 404));

      await expect(acknowledgeAlert(99, fetchImpl)).rejects.toMatchObject({
        name: 'AlertNotAcknowledgeableError',
        reason: 'not_found',
      });
    });

    // requirements.md F8.2: 手動closeは不可。closedへのackは409で返る。
    it('409は「open状態ではない」として区別できる例外に翻訳する', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'alert_already_closed', message: 'closed' } }, 409));

      await expect(acknowledgeAlert(4, fetchImpl)).rejects.toMatchObject({
        name: 'AlertNotAcknowledgeableError',
        reason: 'not_open',
      });
    });

    // 権限エラーを「ackできないアラート」に丸めると、原因の切り分けができなくなる。
    it('403などその他のエラーはApiErrorのまま伝える', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: 'forbidden' } }, 403));

      const rejection = acknowledgeAlert(1, fetchImpl);
      await expect(rejection).rejects.toBeInstanceOf(ApiError);
      await expect(rejection).rejects.not.toBeInstanceOf(AlertNotAcknowledgeableError);
    });
  });
});
