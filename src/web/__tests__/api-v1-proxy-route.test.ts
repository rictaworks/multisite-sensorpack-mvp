/**
 * @jest-environment node
 */
/**
 * Issue #53 A-4: same-origin proxy for `/api/v1/*`.
 *
 * `components/claim/api.ts` fetches `/api/v1/sites` and `/api/v1/claim-codes` as
 * same-origin relative paths on the assumption that Next.js forwards them to Rails
 * server-side. Without this route those paths simply 404, and pointing the browser
 * at Rails directly would expose the deploy platform's raw hostname
 * (.claude/rules/deploy.md: "バックエンドのドメインは隠蔽する").
 *
 * These tests assert the two properties that matter for that rule:
 *   1. the request really reaches Rails at BACKEND_API_BASE_URL (server-side), and
 *   2. nothing about the Rails origin leaks back to the browser.
 */
import { NextRequest } from 'next/server';

import { DELETE, GET, PATCH, POST, PUT } from '../app/api/v1/[...path]/route';

const BACKEND_ORIGIN = 'https://rails-internal.example.railway.app';

function contextFor(path: string[]): { params: Promise<{ path: string[] }> } {
  return { params: Promise.resolve({ path }) };
}

function backendResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

describe('app/api/v1/[...path]/route (same-origin proxy hiding the Rails backend domain)', () => {
  const originalBaseUrl = process.env.BACKEND_API_BASE_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.BACKEND_API_BASE_URL = BACKEND_ORIGIN;
    fetchMock = jest.fn().mockResolvedValue(backendResponse('{"sites":[]}'));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.BACKEND_API_BASE_URL = originalBaseUrl;
    jest.restoreAllMocks();
  });

  function requestedUrl(): string {
    return String(fetchMock.mock.calls[0][0]);
  }

  function requestedInit(): RequestInit {
    return fetchMock.mock.calls[0][1] as RequestInit;
  }

  describe('GET', () => {
    it('forwards the path to Rails under /api/v1 and returns the backend body', async () => {
      const request = new NextRequest('https://app.example.com/api/v1/sites');

      const response = await GET(request, contextFor(['sites']));

      expect(requestedUrl()).toBe(`${BACKEND_ORIGIN}/api/v1/sites`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ sites: [] });
    });

    it('preserves nested paths and the query string', async () => {
      const request = new NextRequest('https://app.example.com/api/v1/devices/42/commands?limit=10');

      await GET(request, contextFor(['devices', '42', 'commands']));

      expect(requestedUrl()).toBe(`${BACKEND_ORIGIN}/api/v1/devices/42/commands?limit=10`);
    });

    // The Rails session cookie is what authenticates the user; without it every
    // proxied call would come back 401 (Authenticatable/TenantScoped).
    it('forwards the browser cookie header so the Rails session is honoured', async () => {
      const request = new NextRequest('https://app.example.com/api/v1/sites', {
        headers: { cookie: 'session_id=abc' },
      });

      await GET(request, contextFor(['sites']));

      expect(new Headers(requestedInit().headers).get('cookie')).toBe('session_id=abc');
    });

    // Forwarding the browser's Host header would make Rails' own host authorization
    // (Issue #53 A-1, config.hosts) evaluate the Next.js domain instead of its own.
    it('does not forward the browser Host header to Rails', async () => {
      const request = new NextRequest('https://app.example.com/api/v1/sites', {
        headers: { host: 'app.example.com' },
      });

      await GET(request, contextFor(['sites']));

      expect(new Headers(requestedInit().headers).get('host')).toBeNull();
    });
  });

  describe('リクエストボディを伴うメソッド', () => {
    it.each([
      ['POST', POST],
      ['PATCH', PATCH],
      ['PUT', PUT],
    ] as const)('%s のボディとContent-Typeをそのまま転送する', async (method, handler) => {
      const request = new NextRequest('https://app.example.com/api/v1/claim-codes', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: 1, recaptchaToken: 'token' }),
      });

      await handler(request, contextFor(['claim-codes']));

      const init = requestedInit();
      expect(init.method).toBe(method);
      expect(init.body).toBe(JSON.stringify({ siteId: 1, recaptchaToken: 'token' }));
      expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    });

    it('DELETE を転送する', async () => {
      const request = new NextRequest('https://app.example.com/api/v1/sites/1', { method: 'DELETE' });

      await DELETE(request, contextFor(['sites', '1']));

      expect(requestedInit().method).toBe('DELETE');
    });
  });

  describe('バックエンドドメインの隠蔽', () => {
    it('Set-Cookie を返却する(セッション確立をブラウザへ引き継ぐ)', async () => {
      fetchMock.mockResolvedValue(
        backendResponse('{}', { headers: { 'set-cookie': 'session_id=xyz; Path=/; HttpOnly' } })
      );
      const request = new NextRequest('https://app.example.com/api/v1/sites');

      const response = await GET(request, contextFor(['sites']));

      expect(response.headers.get('set-cookie')).toContain('session_id=xyz');
    });

    // Location/Via 等にRailwayの生ドメインが載って返ると、開発者ツールのネットワークタブから
    // バックエンドのホスト名が読み取れてしまう。許可リスト方式で転送ヘッダを絞る。
    it('バックエンドのオリジンを含むヘッダ(Location等)をブラウザへ返さない', async () => {
      fetchMock.mockResolvedValue(
        backendResponse('{}', {
          status: 302,
          headers: { location: `${BACKEND_ORIGIN}/api/v1/elsewhere`, via: '1.1 railway' },
        })
      );
      const request = new NextRequest('https://app.example.com/api/v1/sites');

      const response = await GET(request, contextFor(['sites']));

      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('via')).toBeNull();
      expect([...response.headers.values()].join(' ')).not.toContain('railway');
    });

    it('バックエンドのエラーレスポンスはステータスと本文をそのまま伝える(握りつぶさない)', async () => {
      fetchMock.mockResolvedValue(
        backendResponse('{"error":{"code":"rate_limited","message":"too many"}}', { status: 429 })
      );
      const request = new NextRequest('https://app.example.com/api/v1/claim-codes', { method: 'POST' });

      const response = await POST(request, contextFor(['claim-codes']));

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'rate_limited', message: 'too many' },
      });
    });

    it('BACKEND_API_BASE_URL 未設定なら502を返し、原因を本文に含めない(内部情報を出さない)', async () => {
      delete process.env.BACKEND_API_BASE_URL;
      const request = new NextRequest('https://app.example.com/api/v1/sites');

      const response = await GET(request, contextFor(['sites']));

      expect(response.status).toBe(502);
      const body = await response.text();
      expect(body).not.toContain('BACKEND_API_BASE_URL');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('バックエンドへ到達できない場合も502を返し、接続先を本文に含めない', async () => {
      fetchMock.mockRejectedValue(new Error(`connect ECONNREFUSED ${BACKEND_ORIGIN}`));
      const request = new NextRequest('https://app.example.com/api/v1/sites');

      const response = await GET(request, contextFor(['sites']));

      expect(response.status).toBe(502);
      await expect(response.text()).resolves.not.toContain('railway');
    });
  });
});
