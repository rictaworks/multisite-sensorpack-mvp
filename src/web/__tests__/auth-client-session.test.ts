import {
  fetchCurrentSession,
  signInWithGoogle,
  signOutOfBackendSession,
} from '../lib/auth/clientSession';

/**
 * lib/auth/clientSession.ts is the browser-side counterpart of
 * app/api/auth/session/route.ts: it only ever calls the same-origin
 * `/api/auth/session` path (never a raw Rails URL), keeping the backend
 * domain hidden from the browser (.claude/rules/deploy.md).
 */
describe('lib/auth/clientSession', () => {
  const ORIGINAL_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  describe('fetchCurrentSession', () => {
    it('calls the same-origin session endpoint and returns the user on success', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await fetchCurrentSession();

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'GET' }));
      expect(result?.user.id).toBe('user-1');
    });

    it('returns null (unauthenticated) on 401 without throwing', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;

      const result = await fetchCurrentSession();

      expect(result).toBeNull();
    });

    it('throws on unexpected server errors instead of silently returning null', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

      await expect(fetchCurrentSession()).rejects.toThrow();
    });
  });

  describe('signInWithGoogle', () => {
    it('POSTs the Google ID token and reCAPTCHA token to the same-origin endpoint', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await signInWithGoogle('id-token', 'recaptcha-token');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/session',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ idToken: 'id-token', recaptchaToken: 'recaptcha-token' }),
        })
      );
      expect(result.user.id).toBe('user-1');
    });

    it('throws when the login is rejected (e.g. reCAPTCHA/rate limit failure)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { code: 'recaptcha_failed', message: 'blocked' } }),
      }) as unknown as typeof fetch;

      await expect(signInWithGoogle('id-token', 'recaptcha-token')).rejects.toThrow();
    });
  });

  describe('signOutOfBackendSession', () => {
    it('calls DELETE on the same-origin endpoint', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
      global.fetch = fetchMock as unknown as typeof fetch;

      await signOutOfBackendSession();

      expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'DELETE' }));
    });
  });
});
