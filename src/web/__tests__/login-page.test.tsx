import { render, screen } from '@testing-library/react';

const mockGetServerSession = jest.fn();
jest.mock('../lib/auth/requireSession', () => ({
  __esModule: true,
  getServerSession: () => mockGetServerSession(),
}));

const mockIsDevAutoAuthEnabled = jest.fn();
jest.mock('../lib/auth/environment', () => ({
  __esModule: true,
  isDevAutoAuthEnabled: () => mockIsDevAutoAuthEnabled(),
}));

const mockRedirect = jest.fn();
jest.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}));

jest.mock('../components/auth/LoginView', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => (
    <div data-testid="login-view" data-props={JSON.stringify(props)} />
  ),
}));

import LoginPage from '../app/[locale]/(auth)/login/page';

const ORIGINAL_ENV = { ...process.env };

describe('app/[locale]/(auth)/login/page.tsx', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = 'recaptcha-site-key';
    mockGetServerSession.mockReset();
    mockIsDevAutoAuthEnabled.mockReset();
    mockRedirect.mockReset();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured (fail fast, no fallback default)', async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    mockGetServerSession.mockResolvedValue(null);

    await expect(LoginPage({ params: Promise.resolve({ locale: 'ja' }) })).rejects.toThrow(
      /NEXT_PUBLIC_GOOGLE_CLIENT_ID/
    );
  });

  it('renders LoginView with the configured Google client id / reCAPTCHA site key when not already authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockIsDevAutoAuthEnabled.mockReturnValue(false);

    const element = await LoginPage({ params: Promise.resolve({ locale: 'ja' }) });
    render(element);

    const props = JSON.parse(screen.getByTestId('login-view').dataset.props as string);
    expect(props).toEqual({
      googleClientId: 'google-client-id',
      recaptchaSiteKey: 'recaptcha-site-key',
      devAutoAuthEnabled: false,
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirects to the locale home page when a session already exists (認証状態管理: セッション保持)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } });
    mockIsDevAutoAuthEnabled.mockReturnValue(false);

    await LoginPage({ params: Promise.resolve({ locale: 'en' }) });

    expect(mockRedirect).toHaveBeenCalledWith('/en');
  });

  it('degrades gracefully (still renders the login screen) if the session check itself fails, e.g. backend not reachable yet', async () => {
    mockGetServerSession.mockRejectedValue(new Error('BACKEND_API_BASE_URL is not set'));
    mockIsDevAutoAuthEnabled.mockReturnValue(false);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const element = await LoginPage({ params: Promise.resolve({ locale: 'ja' }) });
    render(element);

    expect(screen.getByTestId('login-view')).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
