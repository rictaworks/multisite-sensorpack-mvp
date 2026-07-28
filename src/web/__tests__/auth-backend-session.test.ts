/**
 * lib/auth/backendSession.ts is the ONLY place that talks to the real Rails
 * backend for the googleSessionCookie flow (src/shared/contracts/openapi.yaml
 * /auth/session). It must run server-side only (never bundled to the
 * browser, .claude/rules/deploy.md: "バックエンドのドメインは隠蔽する"), and
 * it must fail fast/loud instead of silently falling back
 * (.claude/rules/coding-style.md).
 */

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

describe('lib/auth/backendSession', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
    jest.resetModules();
  });

  it('throws immediately (fail fast, no silent fallback) when BACKEND_API_BASE_URL is not configured', async () => {
    delete process.env.BACKEND_API_BASE_URL;
    const { createBackendSession } = await import('../lib/auth/backendSession');

    await expect(createBackendSession('id-token', 'recaptcha-token', null)).rejects.toThrow(
      /BACKEND_API_BASE_URL/
    );
  });

  it('POSTs the Google ID token and reCAPTCHA token to /auth/session and returns the user + Set-Cookie header', async () => {
    process.env.BACKEND_API_BASE_URL = 'https://backend.internal.example';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'set-cookie' ? 'session_id=abc; HttpOnly; Secure' : null) },
      json: async () => ({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createBackendSession } = await import('../lib/auth/backendSession');
    const result = await createBackendSession('id-token', 'recaptcha-token', null);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.internal.example/auth/session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'id-token', recaptchaToken: 'recaptcha-token' }),
      })
    );
    expect(result.body.user.id).toBe('user-1');
    expect(result.setCookie).toBe('session_id=abc; HttpOnly; Secure');
  });

  it('throws a BackendSessionError (not a silent null) when the backend rejects the ID token/reCAPTCHA', async () => {
    process.env.BACKEND_API_BASE_URL = 'https://backend.internal.example';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: { code: 'invalid_id_token', message: 'invalid' } }),
    }) as unknown as typeof fetch;

    const { createBackendSession, BackendSessionError } = await import('../lib/auth/backendSession');

    await expect(createBackendSession('bad-token', 'recaptcha-token', null)).rejects.toBeInstanceOf(
      BackendSessionError
    );
  });

  it('getBackendSession returns null on 401 (not authenticated) without throwing', async () => {
    process.env.BACKEND_API_BASE_URL = 'https://backend.internal.example';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: { code: 'invalid_session', message: 'no session' } }),
    }) as unknown as typeof fetch;

    const { getBackendSession } = await import('../lib/auth/backendSession');
    const result = await getBackendSession(null);

    expect(result).toBeNull();
  });

  it('getBackendSession forwards the incoming cookie header so the Rails session cookie is checked', async () => {
    process.env.BACKEND_API_BASE_URL = 'https://backend.internal.example';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { getBackendSession } = await import('../lib/auth/backendSession');
    await getBackendSession('session_id=abc');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.internal.example/auth/session',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Cookie: 'session_id=abc' }),
      })
    );
  });

  it('deleteBackendSession calls DELETE and tolerates an already-expired (401) session', async () => {
    process.env.BACKEND_API_BASE_URL = 'https://backend.internal.example';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({ error: { code: 'invalid_session', message: 'no session' } }),
    }) as unknown as typeof fetch;

    const { deleteBackendSession } = await import('../lib/auth/backendSession');
    await expect(deleteBackendSession('session_id=abc')).resolves.toBeUndefined();
  });
});
