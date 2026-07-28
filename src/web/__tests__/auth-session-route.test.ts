/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

jest.mock('../lib/auth/backendSession', () => ({
  __esModule: true,
  BackendSessionError: class BackendSessionError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  createBackendSession: jest.fn(),
  getBackendSession: jest.fn(),
  deleteBackendSession: jest.fn(),
}));

import { DELETE, GET, POST } from '../app/api/auth/session/route';
import { BackendSessionError, createBackendSession, deleteBackendSession, getBackendSession } from '../lib/auth/backendSession';

const mockedCreate = createBackendSession as jest.Mock;
const mockedGet = getBackendSession as jest.Mock;
const mockedDelete = deleteBackendSession as jest.Mock;

describe('app/api/auth/session/route (same-origin proxy hiding the Rails backend domain)', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
    mockedGet.mockReset();
    mockedDelete.mockReset();
  });

  describe('GET', () => {
    it('returns 401 when there is no active backend session', async () => {
      mockedGet.mockResolvedValue(null);
      const request = new NextRequest('https://app.example.com/api/auth/session');

      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('returns 200 with the user when a session exists, forwarding the cookie header', async () => {
      mockedGet.mockResolvedValue({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } });
      const request = new NextRequest('https://app.example.com/api/auth/session', {
        headers: { cookie: 'session_id=abc' },
      });

      const response = await GET(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.user.id).toBe('user-1');
      expect(mockedGet).toHaveBeenCalledWith('session_id=abc');
    });
  });

  describe('POST', () => {
    it('rejects a request missing idToken/recaptchaToken with 400 (no silent pass-through)', async () => {
      const request = new NextRequest('https://app.example.com/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ idToken: 'only-id-token' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('forwards a well-formed request to createBackendSession and relays the Set-Cookie header', async () => {
      mockedCreate.mockResolvedValue({
        body: { user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } },
        setCookie: 'session_id=abc; HttpOnly; Secure',
      });
      const request = new NextRequest('https://app.example.com/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ idToken: 'google-id-token', recaptchaToken: 'recaptcha-token' }),
      });

      const response = await POST(request);

      expect(mockedCreate).toHaveBeenCalledWith('google-id-token', 'recaptcha-token', null);
      expect(response.headers.get('set-cookie')).toBe('session_id=abc; HttpOnly; Secure');
      expect(response.status).toBe(200);
    });

    it('translates a rejected Google ID token / reCAPTCHA into the backend status code', async () => {
      mockedCreate.mockRejectedValue(new BackendSessionError('invalid', 401));
      const request = new NextRequest('https://app.example.com/api/auth/session', {
        method: 'POST',
        body: JSON.stringify({ idToken: 'bad', recaptchaToken: 'bad' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE', () => {
    it('returns 204 after clearing the backend session', async () => {
      mockedDelete.mockResolvedValue(undefined);
      const request = new NextRequest('https://app.example.com/api/auth/session', { method: 'DELETE' });

      const response = await DELETE(request);

      expect(response.status).toBe(204);
    });
  });
});
