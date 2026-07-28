import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { locales } from '../i18n/config';
import ja from '../locales/ja.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import zh from '../locales/zh.json';
import ru from '../locales/ru.json';
import es from '../locales/es.json';
import ar from '../locales/ar.json';

const MESSAGES_BY_LOCALE: Record<(typeof locales)[number], typeof ja> = { ja, en, fr, zh, ru, es, ar };

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

type MockCredentialResponse = { credential?: string };

let capturedGoogleOnSuccess: ((response: MockCredentialResponse) => void) | null = null;
let capturedGoogleOnError: (() => void) | null = null;

jest.mock('@react-oauth/google', () => ({
  __esModule: true,
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: ({
    onSuccess,
    onError,
  }: {
    onSuccess: (response: MockCredentialResponse) => void;
    onError: () => void;
  }) => {
    capturedGoogleOnSuccess = onSuccess;
    capturedGoogleOnError = onError;
    return <button type="button">mock-google-login-button</button>;
  },
}));

let capturedRecaptchaOnChange: ((token: string | null) => void) | null = null;

jest.mock('react-google-recaptcha', () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (token: string | null) => void }) => {
    capturedRecaptchaOnChange = onChange;
    return <button type="button">mock-recaptcha-checkbox</button>;
  },
}));

const mockSignInWithGoogle = jest.fn();
jest.mock('../lib/auth/clientSession', () => ({
  __esModule: true,
  signInWithGoogle: (...args: unknown[]) => mockSignInWithGoogle(...args),
}));

const mockActivateDevAutoAuthSession = jest.fn();
jest.mock('../lib/auth/devAutoAuth', () => ({
  __esModule: true,
  activateDevAutoAuthSession: () => mockActivateDevAutoAuthSession(),
}));

import LoginView from '../components/auth/LoginView';

function renderLoginView(
  overrides: Partial<React.ComponentProps<typeof LoginView>> = {},
  locale: (typeof locales)[number] = 'ja'
) {
  const messages = MESSAGES_BY_LOCALE[locale];
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LoginView
        googleClientId="test-google-client-id"
        recaptchaSiteKey="test-recaptcha-site-key"
        devAutoAuthEnabled={false}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}

describe('LoginView (Issue #17)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSignInWithGoogle.mockReset();
    mockActivateDevAutoAuthSession.mockReset();
    capturedGoogleOnSuccess = null;
    capturedGoogleOnError = null;
    capturedRecaptchaOnChange = null;
  });

  it.each(locales)(
    'renders the login screen copy in %s (.claude/rules/i18n.md: all 7 languages from day one)',
    (locale) => {
      const messages = MESSAGES_BY_LOCALE[locale];
      renderLoginView({}, locale);

      expect(screen.getByRole('heading', { name: messages.login.title })).toBeInTheDocument();
      expect(screen.getByText(messages.login.description)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: messages.login.googleButton })).toBeInTheDocument();
    }
  );

  it('renders the translated Japanese title and description', () => {
    renderLoginView({}, 'ja');

    expect(screen.getByRole('heading', { name: ja.login.title })).toBeInTheDocument();
    expect(screen.getByText(ja.login.description)).toBeInTheDocument();
  });

  it('switches to English translations', () => {
    renderLoginView({}, 'en');

    expect(screen.getByRole('heading', { name: en.login.title })).toBeInTheDocument();
    expect(screen.queryByText(ja.login.title)).not.toBeInTheDocument();
  });

  it('does not render the real Google sign-in button until reCAPTCHA is completed (mirrors the app-ui mock: issueDisabled gating)', () => {
    renderLoginView();

    expect(screen.queryByText('mock-google-login-button')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ja.login.googleButton })).toBeDisabled();
  });

  it('reveals the real Google sign-in button once reCAPTCHA succeeds, and clears it again on reCAPTCHA expiry', () => {
    renderLoginView();

    act(() => {
      capturedRecaptchaOnChange?.('recaptcha-token-123');
    });
    expect(screen.getByText('mock-google-login-button')).toBeInTheDocument();

    act(() => {
      capturedRecaptchaOnChange?.(null);
    });
    expect(screen.queryByText('mock-google-login-button')).not.toBeInTheDocument();
  });

  it('signs in with the Google ID token and the reCAPTCHA token together, then navigates to the locale home page', async () => {
    mockSignInWithGoogle.mockResolvedValue({ user: { id: 'user-1', createdAt: '2026-07-28T00:00:00Z' } });
    renderLoginView({}, 'en');

    act(() => {
      capturedRecaptchaOnChange?.('recaptcha-token-123');
    });
    await act(async () => {
      capturedGoogleOnSuccess?.({ credential: 'google-id-token' });
    });

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledWith('google-id-token', 'recaptcha-token-123');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en');
    });
  });

  it('shows an in-page error (never a native alert/confirm/prompt) when the backend rejects sign-in', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('rejected'));
    const alertSpy = jest.spyOn(window, 'alert');
    renderLoginView({}, 'en');

    act(() => {
      capturedRecaptchaOnChange?.('recaptcha-token-123');
    });
    await act(async () => {
      capturedGoogleOnSuccess?.({ credential: 'google-id-token' });
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(en.login.errors.signInFailed);
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an in-page error when the Google widget itself errors', () => {
    renderLoginView({}, 'en');

    act(() => {
      capturedRecaptchaOnChange?.('recaptcha-token-123');
    });
    act(() => {
      capturedGoogleOnError?.();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(en.login.errors.signInFailed);
  });

  it('never renders the development auto-auth bypass when devAutoAuthEnabled is false (must never reach production UI)', () => {
    renderLoginView({ devAutoAuthEnabled: false });

    expect(screen.queryByText(ja.login.devBypass)).not.toBeInTheDocument();
  });

  it('renders the development auto-auth bypass only when devAutoAuthEnabled is true, and it activates + navigates on click', async () => {
    const user = userEvent.setup();
    renderLoginView({ devAutoAuthEnabled: true }, 'en');

    const bypassButton = screen.getByRole('button', { name: en.login.devBypass });
    expect(bypassButton).toBeInTheDocument();

    await user.click(bypassButton);

    expect(mockActivateDevAutoAuthSession).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/en');
  });
});
