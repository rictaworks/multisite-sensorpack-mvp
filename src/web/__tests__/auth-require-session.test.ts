/**
 * @jest-environment node
 *
 * lib/auth/requireSession.ts is the reusable "認証状態管理(セッション保持・
 * 未認証リダイレクト)" building block Issue #17 asks for. No protected
 * dashboard page exists in this repo yet (those land in separate,
 * in-flight frontend issues), so this is exercised directly rather than
 * through a page — future protected Server Component pages call
 * requireSession(locale) at the top of the component.
 */

const mockCookiesGetAll = jest.fn();
jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ getAll: mockCookiesGetAll })),
}));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}));

jest.mock('../lib/auth/backendSession', () => ({
  __esModule: true,
  getBackendSession: jest.fn(),
}));

import { getBackendSession } from '../lib/auth/backendSession';
import { getServerSession, requireSession } from '../lib/auth/requireSession';

const mockedGetBackendSession = getBackendSession as jest.Mock;

describe('lib/auth/requireSession', () => {
  beforeEach(() => {
    mockCookiesGetAll.mockReset();
    mockRedirect.mockReset();
    mockedGetBackendSession.mockReset();
  });

  describe('getServerSession', () => {
    it('returns null and does not call the backend when there are no cookies at all', async () => {
      mockCookiesGetAll.mockReturnValue([]);

      const session = await getServerSession();

      expect(session).toBeNull();
      expect(mockedGetBackendSession).not.toHaveBeenCalled();
    });

    it('rebuilds the Cookie header from the Next.js cookie jar and forwards it to the backend', async () => {
      mockCookiesGetAll.mockReturnValue([{ name: 'session_id', value: 'abc' }]);
      mockedGetBackendSession.mockResolvedValue({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } });

      const session = await getServerSession();

      expect(mockedGetBackendSession).toHaveBeenCalledWith('session_id=abc');
      expect(session?.user.id).toBe('user-1');
    });
  });

  describe('requireSession', () => {
    it('returns the session when authenticated (no redirect)', async () => {
      mockCookiesGetAll.mockReturnValue([{ name: 'session_id', value: 'abc' }]);
      mockedGetBackendSession.mockResolvedValue({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } });

      const session = await requireSession('ja');

      expect(session.user.id).toBe('user-1');
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('redirects to the locale-prefixed login page when unauthenticated', async () => {
      mockCookiesGetAll.mockReturnValue([]);

      await requireSession('fr');

      expect(mockRedirect).toHaveBeenCalledWith('/fr/login');
    });
  });
});
