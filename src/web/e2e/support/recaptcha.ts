import type { Page } from '@playwright/test';

/**
 * Drives Google's real reCAPTCHA v2 checkbox widget to a "verified" state.
 *
 * This only works because `.env.e2e` configures
 * `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` with Google's own published "always
 * passes" test site key (documented at
 * https://developers.google.com/recaptcha/docs/faq — "Is there a way to
 * always get passing/failing validation responses for testing?"). It is not
 * a stub or a fake: this clicks the actual Google-hosted widget inside its
 * (cross-origin) iframe, the same way a person would, and the resulting
 * `onChange` token is the app's real integration path
 * (components/claim/RecaptchaField.tsx / components/auth/LoginView.tsx both
 * just forward whatever `react-google-recaptcha` reports).
 */
export async function passTestRecaptcha(page: Page): Promise<void> {
  const anchorFrame = page.frameLocator('iframe[title="reCAPTCHA"]').first();
  const anchor = anchorFrame.locator('#recaptcha-anchor');
  await anchor.waitFor({ state: 'visible', timeout: 15_000 });
  await anchor.click();
  await anchorFrame.locator('#recaptcha-anchor[aria-checked="true"]').waitFor({ timeout: 15_000 });
}
