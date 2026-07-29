import type { Page } from '@playwright/test';

/**
 * components/claim/DeviceClaimView.tsx (Issue #19) calls the *real* relative
 * endpoints `GET /api/v1/sites` and `POST /api/v1/claim-codes`
 * (components/sites/api.ts and components/claim/api.ts) — unlike the
 * dashboard/alerts/control/summary screens, this one was NOT built against an
 * in-memory mock.
 *
 * Those paths are now forwarded to Rails server-side by
 * app/api/v1/[...path]/route.ts (Issue #53 A-4), so they no longer 404 as every
 * WORK/ report for issues #17–#22 recorded. They do, however, require a running
 * Rails backend, which this suite deliberately does not depend on.
 *
 * Per the Issue #25 work instructions ("バックエンドとの実結線が未完了の画
 * 面については、モックAPIのままで良いのでUI遷移・表示のE2E検証に留め、そ
 * の旨をテストコード内のコメントやPRに明記する"), this file stubs those two
 * requests at the Playwright network layer — this is a standard E2E-test
 * technique (intercepting the browser's network layer for test isolation),
 * not an application-level fallback: no src/web source file is changed, and
 * DeviceClaimView's real fetch/validation/rendering logic runs unmodified
 * against these stubbed responses.
 *
 * Fixture site names ("倉庫A"/"実家") intentionally echo
 * lib/dashboard/mockData.ts's SITE_FIXTURES and requirements.md 1.8's
 * minimum test configuration (2 users / 2 sites / 2 devices) for narrative
 * consistency across the suite — they are not shared state between routes.
 */

export interface StubSite {
  id: number;
  name: string;
}

export const STUB_SITES: StubSite[] = [
  { id: 1, name: '倉庫A' },
  { id: 2, name: '実家' },
];

function toSiteResponseBody(sites: StubSite[]) {
  return {
    sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      deviceCount: 1,
      onlineDeviceCount: 1,
      openAlertCount: 0,
      latestTemperatureC: 22.5,
      latestHumidityPct: 55,
      createdAt: new Date().toISOString(),
    })),
  };
}

/** Stubs `GET /api/v1/sites` with a fixed, non-empty site list. */
export async function stubSitesList(page: Page, sites: StubSite[] = STUB_SITES): Promise<void> {
  await page.route('**/api/v1/sites', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(toSiteResponseBody(sites)) });
  });
}

/** Stubs `GET /api/v1/sites` with an empty list (site-picker empty state / validation path). */
export async function stubEmptySitesList(page: Page): Promise<void> {
  await stubSitesList(page, []);
}

/** Stubs a successful `POST /api/v1/claim-codes` (8-digit code, 15 minute expiry per openapi.yaml). */
export async function stubClaimCodeSuccess(page: Page, code = 'ABCD1234'): Promise<void> {
  await page.route('**/api/v1/claim-codes', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code, expiresAt }),
    });
  });
}

/** Stubs `POST /api/v1/claim-codes` returning 429 (rate limited / reCAPTCHA rejected). */
export async function stubClaimCodeRateLimited(page: Page): Promise<void> {
  await page.route('**/api/v1/claim-codes', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
    });
  });
}
