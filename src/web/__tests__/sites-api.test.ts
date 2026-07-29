import { ApiError } from '../lib/api/apiClient';
import { createSite, deleteSite, fetchSites } from '../components/sites/api';

/**
 * Issue #61: 拠点(Site)の作成・削除のAPIクライアント。
 *
 * リクエストはすべて同一オリジンの相対パス(`/api/v1/...`)へ送り、Next.jsのサーバー側
 * プロキシがRailsへ転送する(Issue #53 A-4)。このモジュールがRailsのホストを直接
 * 知ることはない(.claude/rules/deploy.md)。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

// 204にはボディが無い。json()を呼ぼうとすれば落ちるようにしておき、
// 実装が本文を読もうとしていないことを保証する。
function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: '204',
    json: async () => {
      throw new Error('204 responses have no body');
    },
  } as unknown as Response;
}

const SITE = {
  id: 1,
  name: '倉庫A',
  deviceCount: 0,
  onlineDeviceCount: 0,
  openAlertCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('sites/api', () => {
  describe('fetchSites', () => {
    it('拠点の配列を返す', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ sites: [SITE] }));

      const sites = await fetchSites(fetchImpl);

      expect(sites).toEqual([SITE]);
      expect(fetchImpl).toHaveBeenCalledWith(
        '/api/v1/sites',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    it('セッション切れ(401)をunauthorizedとして投げる', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'unauthorized', message: 'no session' } }, 401));

      await expect(fetchSites(fetchImpl)).rejects.toMatchObject({
        name: 'ApiError',
        status: 401,
        code: 'unauthorized',
      });
    });

    it('通信そのものが失敗した場合はnetwork_errorとして投げる(空配列にフォールバックしない)', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new TypeError('network down'));

      await expect(fetchSites(fetchImpl)).rejects.toBeInstanceOf(ApiError);
      await expect(fetchSites(fetchImpl)).rejects.toMatchObject({ code: 'network_error' });
    });
  });

  describe('createSite', () => {
    it('nameをPOSTし、作成された拠点を返す', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(SITE, 201));

      const created = await createSite({ name: '倉庫A' }, fetchImpl);

      expect(created).toEqual(SITE);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('/api/v1/sites');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(JSON.parse(init.body)).toEqual({ name: '倉庫A' });
    });

    it('400をvalidation_errorとして投げる(成功をでっち上げない)', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'validation_error', message: '名前が長すぎます' } }, 400));

      await expect(createSite({ name: 'あ'.repeat(101) }, fetchImpl)).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        code: 'validation_error',
      });
    });

    it('通信そのものが失敗した場合はnetwork_errorとして投げる', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(createSite({ name: '倉庫A' }, fetchImpl)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('deleteSite', () => {
    it('DELETEを送り、204を正常終了として扱う(本文を読もうとしない)', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(noContentResponse());

      await expect(deleteSite(1, fetchImpl)).resolves.toBeUndefined();

      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('/api/v1/sites/1');
      expect(init.method).toBe('DELETE');
      expect(init.credentials).toBe('include');
    });

    it('他ユーザーの拠点(403)をforbiddenとして投げる', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: '権限がありません' } }, 403));

      await expect(deleteSite(1, fetchImpl)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    });

    it('存在しない拠点(404)をnot_foundとして投げる', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found' } }, 404));

      await expect(deleteSite(999, fetchImpl)).rejects.toMatchObject({ status: 404, code: 'not_found' });
    });
  });
});
