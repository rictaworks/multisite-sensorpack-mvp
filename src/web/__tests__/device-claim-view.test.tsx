import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import DeviceClaimView from '../components/claim/DeviceClaimView';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

// react-google-recaptcha loads Google's script over the network and renders an
// iframe widget — neither works nor is meaningful inside jsdom. We stub it with
// a simple button that lets tests drive the same onChange/onExpired contract
// the real widget exposes, matching Issue #19's validation-error test requirement.
jest.mock('react-google-recaptcha', () => {
  return function MockReCAPTCHA({
    onChange,
  }: {
    onChange: (token: string | null) => void;
  }) {
    return (
      <button type="button" data-testid="mock-recaptcha" onClick={() => onChange('mock-recaptcha-token')}>
        mock-recaptcha
      </button>
    );
  };
});

const originalEnv = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

const SITES_RESPONSE = {
  sites: [
    {
      id: 1,
      name: '倉庫A',
      deviceCount: 2,
      onlineDeviceCount: 1,
      openAlertCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      name: '倉庫B',
      deviceCount: 0,
      onlineDeviceCount: 0,
      openAlertCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

function renderView(locale: 'ja' | 'en' = 'ja') {
  const messages = locale === 'ja' ? ja : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DeviceClaimView />
    </NextIntlClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

describe('DeviceClaimView', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = 'test-site-key';
    // jsdom's `global` has no native `fetch` to spy on (unlike a real browser/Node
    // runtime), so we install a plain jest.fn() rather than jest.spyOn.
    global.fetch = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sites')) {
        return jsonResponse(SITES_RESPONSE);
      }
      throw new Error(`unexpected fetch call in test: ${url}`);
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // @ts-expect-error -- deleting the test-installed stub so each test starts clean.
    delete global.fetch;
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = originalEnv;
  });

  it('loads sites and lets the user pick one, matching the site-selector wording', async () => {
    renderView('ja');

    expect(await screen.findByRole('button', { name: '倉庫A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '倉庫B' })).toBeInTheDocument();
    expect(screen.getByText(ja.deviceClaim.form.siteLabel)).toBeInTheDocument();
    // requirements.md 1.4: no address field/hint anywhere on this screen.
    expect(screen.getByText(ja.deviceClaim.form.nameHint)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('例：倉庫A 奥の棚')).toBeInTheDocument();
  });

  it('shows validation errors when submitting without a name or without completing reCAPTCHA', async () => {
    renderView('ja');
    await screen.findByRole('button', { name: '倉庫A' });

    fireEvent.click(screen.getByRole('button', { name: ja.deviceClaim.form.submit }));

    expect(await screen.findByText(ja.deviceClaim.errors.nameRequired)).toBeInTheDocument();
    expect(screen.getByText(ja.deviceClaim.errors.recaptchaRequired)).toBeInTheDocument();
    // The submit must not have called the claim-codes endpoint.
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/claim-codes'),
      expect.anything()
    );
  });

  it('issues a claim code and displays the 8-digit code with its 15 minute expiry', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sites')) {
        return jsonResponse(SITES_RESPONSE);
      }
      if (url.endsWith('/api/v1/claim-codes') && init?.method === 'POST') {
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        return jsonResponse({ code: 'AB12CD34', expiresAt }, 201);
      }
      throw new Error(`unexpected fetch call in test: ${url}`);
    });

    renderView('ja');
    await screen.findByRole('button', { name: '倉庫A' });

    fireEvent.change(screen.getByPlaceholderText('例：倉庫A 奥の棚'), {
      target: { value: '倉庫A 奥の棚' },
    });
    fireEvent.click(screen.getByTestId('mock-recaptcha'));
    fireEvent.click(screen.getByRole('button', { name: ja.deviceClaim.form.submit }));

    expect(await screen.findByTestId('claim-code')).toHaveTextContent('AB12CD34');
    expect(screen.getByText(/15:00/)).toBeInTheDocument();
  });

  it('shows a localized error message when claim-code issuance is rate limited (429)', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/sites')) {
        return jsonResponse(SITES_RESPONSE);
      }
      if (url.endsWith('/api/v1/claim-codes') && init?.method === 'POST') {
        return jsonResponse({ error: { code: 'rate_limited', message: 'too many requests' } }, 429);
      }
      throw new Error(`unexpected fetch call in test: ${url}`);
    });

    renderView('ja');
    await screen.findByRole('button', { name: '倉庫A' });

    fireEvent.change(screen.getByPlaceholderText('例：倉庫A 奥の棚'), {
      target: { value: '倉庫A 奥の棚' },
    });
    fireEvent.click(screen.getByTestId('mock-recaptcha'));
    fireEvent.click(screen.getByRole('button', { name: ja.deviceClaim.form.submit }));

    expect(await screen.findByText(ja.deviceClaim.errors.rateLimited)).toBeInTheDocument();
  });

  it('renders in English with every visible string translated (7-language i18n switch)', async () => {
    renderView('en');

    expect(await screen.findByRole('button', { name: '倉庫A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: en.deviceClaim.title })).toBeInTheDocument();
    expect(screen.getByText(en.deviceClaim.form.nameHint)).toBeInTheDocument();
    expect(screen.queryByText(ja.deviceClaim.title)).not.toBeInTheDocument();
  });

  it('fails closed (shows a notice, never a fake pass) when reCAPTCHA is not configured', async () => {
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = '';
    renderView('ja');
    await screen.findByRole('button', { name: '倉庫A' });

    expect(screen.getByTestId('recaptcha-unconfigured')).toHaveTextContent(
      ja.deviceClaim.form.recaptchaUnconfigured
    );
    expect(screen.queryByTestId('mock-recaptcha')).not.toBeInTheDocument();
  });
});
