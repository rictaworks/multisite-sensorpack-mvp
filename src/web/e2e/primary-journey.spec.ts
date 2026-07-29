import { expect, test } from '@playwright/test';
import { t } from './support/messages';
import { passTestRecaptcha } from './support/recaptcha';
import { STUB_SITES, stubClaimCodeSuccess, stubSitesList } from './support/claimApiStub';
import { stubDashboardApi } from './support/dashboardApiStub';

/**
 * Holistic smoke test for the "主要導線" (primary user journey) Issue #25
 * asks for: home → login screen → dashboard → device detail → device claim
 * → alerts → control → summary — each screen's detailed behaviour already
 * has its own focused spec file in this directory; this one exists purely
 * to prove the sequence of screens a real user session would touch all
 * render together without interfering with one another (e.g. no leftover
 * state, no console crash carried over from a previous screen).
 *
 * As documented in login.spec.ts and every screen's own spec file, this
 * repository does not yet have real cross-screen navigation links (no
 * shared header/nav — a residual gap noted in every WORK/ report since
 * Issue #18) or real backend wiring for most screens, so each step below is
 * an explicit `page.goto()` rather than a simulated click through a shared
 * nav bar, and screens still backed by real (but here stubbed) fetch calls
 * are called out inline.
 */
test('主要導線: ホーム→ログイン→ダッシュボード→デバイス詳細→デバイス登録→お知らせ→運用ツール→きょうのまとめ', async ({
  page,
}) => {
  await page.goto('/ja');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'home.title') })).toBeVisible();

  await page.goto('/ja/login');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'login.title') })).toBeVisible();
  await expect(page.getByRole('button', { name: t('ja', 'login.devBypass') })).toBeVisible();

  // ダッシュボードは実APIへ結線済みのため、応答をネットワーク層でスタブする。
  await stubDashboardApi(page);
  await page.goto('/ja/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'dashboard.overview.title') })).toBeVisible();
  await expect(page.getByTestId('stat-sites-value')).toHaveText('2');

  await page.goto('/ja/dashboard/1');
  await expect(page.getByRole('group')).toBeVisible();

  await stubSitesList(page);
  await stubClaimCodeSuccess(page, 'JRNY0001');
  await page.goto('/ja/devices/claim');
  await page.getByRole('button', { name: STUB_SITES[0].name, exact: true }).click();
  await page.getByLabel(t('ja', 'deviceClaim.form.nameLabel')).fill('E2E主要導線テスト機器');
  await passTestRecaptcha(page);
  await page.getByRole('button', { name: t('ja', 'deviceClaim.form.submit') }).click();
  await expect(page.getByTestId('claim-code')).toHaveText('JRNY0001', { timeout: 10_000 });

  await page.goto('/ja/alerts');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'alerts.title') })).toBeVisible();
  await expect(page.getByRole('button', { name: t('ja', 'alerts.ackButton') }).first()).toBeVisible();

  await page.goto('/ja/control');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'control.title') })).toBeVisible();
  await expect(page.getByRole('switch').first()).toBeVisible();

  await page.goto('/ja/summary');
  await expect(page.getByRole('heading', { level: 1, name: t('ja', 'summary.title') })).toBeVisible();
  await expect(page.getByRole('button', { name: t('ja', 'summary.generateButton') })).toBeVisible();
});
