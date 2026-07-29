import { expect, test } from '@playwright/test';
import { ALL_LOCALES, t } from './support/messages';
import { passTestRecaptcha } from './support/recaptcha';

/**
 * 主要導線: トップページ → ログイン画面表示 → 開発環境自動認証 →
 * ダッシュボード表示 (Issue #25 work instructions).
 *
 * Runs against the `primary-flows` project (APP_ENV=development server, see
 * playwright.config.ts).
 *
 * Scope note (see playwright.config.ts's long comment for the full
 * investigation): this suite serves the app via `next build && next start`,
 * not `next dev`, because `next dev` does not hydrate under Playwright in
 * this sandbox. That is a reliable, honest way to test almost everything —
 * but the dev-only auto-auth bypass (lib/auth/devAutoAuth.ts) is *itself*
 * gated by `process.env.NODE_ENV`, which Next.js always inlines as
 * "production" into any built client bundle regardless of the `APP_ENV` the
 * server is started with. So this file verifies the button is rendered
 * (matching `.claude/rules/environment.md`'s requirement that the shortcut
 * exists only in development) but does not click through it — doing so
 * against a built bundle deterministically throws
 * ("activateDevAutoAuthSession() may only run when isDevAutoAuthEnabled()
 * is true"), which would not be evidence of anything about the real `next
 * dev` behaviour a developer or CI actually ships. See
 * environment-production.spec.ts for the fail-closed side of this
 * guarantee, and e2e/README.md for the full writeup.
 *
 * Known gap this suite works around rather than papers over: HomeView.tsx
 * has no actual `<Link>` to the login screen yet (its nav items are plain
 * `<li>` text — see WORK/2026-07-28-issue-17-login.md and every later
 * screen's WORK report noting "全画面共通のヘッダー・ナビゲーション導入は
 * 別issueでの検討を推奨"). Every screen transition in this suite therefore
 * navigates directly via `page.goto()` instead of clicking a nav link, and
 * is written to make that explicit rather than pretend a link exists.
 */

test.describe('トップページ・ログイン画面', () => {
  test('トップページが表示される', async ({ page }) => {
    await page.goto('/ja');
    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'home.title') })).toBeVisible();
    await expect(page.getByText(t('ja', 'home.description'))).toBeVisible();
  });

  test('トップページからの直接遷移でログイン画面が表示される(トップページ自体にはまだリンクがない — 既知の残課題)', async ({
    page,
  }) => {
    await page.goto('/ja');
    // No <Link> exists yet from the home page to /login (see file header).
    // This is a direct navigation, not a simulated click on a real link.
    await page.goto('/ja/login');
    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'login.title') })).toBeVisible();
    await expect(page.getByText(t('ja', 'login.description'))).toBeVisible();
  });

  for (const locale of ALL_LOCALES) {
    test(`ログイン画面が${locale}で表示崩れなく表示される(7言語対応, .claude/rules/i18n.md)`, async ({ page }) => {
      await page.goto(`/${locale}/login`);
      await expect(page.getByRole('heading', { level: 1, name: t(locale, 'login.title') })).toBeVisible();
      await expect(page.getByRole('button', { name: t(locale, 'login.googleButton') })).toBeVisible();

      const expectedDir = locale === 'ar' ? 'rtl' : 'ltr';
      await expect(page.locator('html')).toHaveAttribute('dir', expectedDir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('開発環境ではログイン画面に開発用バイパスボタンが表示される(.claude/rules/environment.md)', async ({
    page,
  }) => {
    await page.goto('/ja/login');
    await expect(page.getByRole('button', { name: t('ja', 'login.devBypass') })).toBeVisible();
  });

  test('GoogleログインボタンはreCAPTCHA通過まで無効表示のまま、通過後に実体化する', async ({ page }) => {
    await page.goto('/ja/login');

    const disabledGoogleButton = page.getByRole('button', {
      name: t('ja', 'login.googleButton'),
      disabled: true,
    });
    await expect(disabledGoogleButton).toBeVisible();
    // Only one actionable control claims to be "Sign in with Google" before
    // reCAPTCHA passes — a real (non-placeholder) Google button must not
    // exist yet (requirements.md: 一般消費者は実際に使えるGoogleログインのみ).
    await expect(page.locator('iframe[src*="accounts.google.com"]')).toHaveCount(0);

    await passTestRecaptcha(page);

    // After passing, react-google-recaptcha's onChange fires with a real
    // token and LoginView swaps the disabled placeholder for the actual
    // Google Identity Services button (an iframe Google itself renders —
    // this repository never re-implements the OAuth button,
    // .claude/rules/architecture.md). Asserting DOM presence rather than
    // Playwright's stricter `toBeVisible` here deliberately: Google sizes
    // that iframe asynchronously via its own postMessage protocol, and this
    // app does not pass explicit width/size props to <GoogleLogin>, so the
    // iframe can genuinely sit at 0x0 for a while in a headless run — a
    // real-world quirk of the third-party widget, not something this
    // E2E-only issue should paper over or a screen-rendering issue in scope
    // here (pixel-level styling review is explicitly deferred to a designer
    // pass per every prior screen's WORK/ report).
    const googleButtonFrame = page.locator('iframe[src*="accounts.google.com"]');
    await expect(googleButtonFrame).toHaveCount(1, { timeout: 10_000 });
    await expect(googleButtonFrame).toBeAttached();
    await expect(disabledGoogleButton).toHaveCount(0);
  });
});
