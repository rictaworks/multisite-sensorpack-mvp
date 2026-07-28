import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import LoginView from '../../../../components/auth/LoginView';
import { isDevAutoAuthEnabled } from '../../../../lib/auth/environment';
import { getServerSession } from '../../../../lib/auth/requireSession';

type LoginPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'login' });
  return { title: t('title') };
}

/**
 * Public config the Google Identity Services button and the reCAPTCHA
 * widget need in the browser. Both are *client IDs*, not secrets (Google's
 * OAuth client id and a reCAPTCHA *site* key are meant to be public — only
 * the reCAPTCHA *secret* key and the Rails backend URL are server-only, see
 * lib/auth/backendSession.ts). Still sourced from the environment rather
 * than hardcoded (root CLAUDE.md), and fails fast if missing rather than
 * silently rendering a broken button (.claude/rules/coding-style.md).
 */
function getRequiredPublicEnv(name: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID' | 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Configure it via .env (development) or the deploy platform ` +
        'environment variables (production) before the login screen can render.'
    );
  }
  return value;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;

  // "認証状態管理（セッション保持）": if the visitor already has a valid
  // Rails session cookie, sending them back to the login screen would be
  // wrong — send them to the (locale) home page instead. This check is
  // best-effort: a session-check failure (e.g. the backend isn't deployed
  // yet in an early environment) must not turn the login screen itself
  // into a 500 page, so we log it (debug traceability,
  // .claude/rules/coding-style.md) and fall through to rendering the login
  // screen, which is the safe default (worst case an already-authenticated
  // user briefly sees the login screen again — never a security issue).
  // IMPORTANT: redirect() must be called OUTSIDE this try block. It works by
  // throwing a special Next.js-internal error that the framework catches
  // higher up the render tree; catching it here ourselves would silently
  // swallow the redirect instead of performing it.
  let existingSession = null;
  try {
    existingSession = await getServerSession();
  } catch (error) {
    console.error('[login-page] Skipping the already-authenticated redirect: session check failed.', error);
  }
  if (existingSession) {
    redirect(`/${locale}`);
  }

  const googleClientId = getRequiredPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID');
  const recaptchaSiteKey = getRequiredPublicEnv('NEXT_PUBLIC_RECAPTCHA_SITE_KEY');

  return (
    <LoginView
      googleClientId={googleClientId}
      recaptchaSiteKey={recaptchaSiteKey}
      devAutoAuthEnabled={isDevAutoAuthEnabled()}
    />
  );
}
