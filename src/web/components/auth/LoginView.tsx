'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { GoogleLogin, GoogleOAuthProvider, type CredentialResponse } from '@react-oauth/google';
import ReCAPTCHA from 'react-google-recaptcha';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faCircleExclamation, faFlask, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { signInWithGoogle } from '../../lib/auth/clientSession';
import { activateDevAutoAuthSession } from '../../lib/auth/devAutoAuth';
import styles from './LoginView.module.css';

/**
 * Google-only sign-in screen (Issue #17).
 *
 * - "一般消費者はGoogleログインのみでログインできる": the only actionable
 *   sign-in control is Google's own "Sign in with Google" button
 *   (@react-oauth/google, wrapping Google Identity Services — a real,
 *   maintained OSS library, not a hand-rolled OAuth client).
 * - "reCAPTCHAをログイン導線に適用する": the Google button only becomes
 *   interactive after the reCAPTCHA widget yields a token, mirroring the
 *   `issueDisabled: !claim.recaptcha` gating pattern used for the claim-code
 *   form in app-ui/SensorPack Dashboard.dc.html (reference only).
 * - No native alert()/confirm()/prompt() anywhere (root CLAUDE.md): errors
 *   render as an in-page `role="alert"` element.
 * - Icons are Font Awesome only, no emoji (root CLAUDE.md), via the same
 *   @fortawesome/react-fontawesome + free-*-svg-icons component pattern
 *   already established by components/alerts/AlertBadge.tsx.
 * - The development-only bypass button is rendered from a boolean the
 *   Server Component page computed via lib/auth/environment.ts; when false
 *   (production, or anything not unambiguously "development") this
 *   component renders nothing for it at all — no hidden-but-present DOM
 *   node, no dead code path a user could trigger
 *   (.claude/rules/environment.md).
 */

type LoginViewProps = {
  googleClientId: string;
  recaptchaSiteKey: string;
  devAutoAuthEnabled: boolean;
};

export default function LoginView({ googleClientId, recaptchaSiteKey, devAutoAuthEnabled }: LoginViewProps) {
  const t = useTranslations('login');
  const locale = useLocale();
  const tLegal = useTranslations('legal');
  const router = useRouter();

  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function completeSignIn(idToken: string, verifiedRecaptchaToken: string) {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signInWithGoogle(idToken, verifiedRecaptchaToken);
      router.push(`/${locale}`);
    } catch {
      // Fail visibly in the UI (role="alert"), never a native alert().
      setErrorMessage(t('errors.signInFailed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGoogleSuccess(credentialResponse: CredentialResponse) {
    // Defense in depth: the button is only rendered once recaptchaToken is
    // set, but never trust that alone — re-check before calling the backend.
    if (!credentialResponse.credential || !recaptchaToken) {
      setErrorMessage(t('errors.signInFailed'));
      return;
    }
    void completeSignIn(credentialResponse.credential, recaptchaToken);
  }

  function handleGoogleError() {
    setErrorMessage(t('errors.signInFailed'));
  }

  function handleDevBypass() {
    activateDevAutoAuthSession();
    router.push(`/${locale}`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('description')}</p>

        <div className={styles.recaptchaRow}>
          <ReCAPTCHA
            sitekey={recaptchaSiteKey}
            onChange={setRecaptchaToken}
            onExpired={() => setRecaptchaToken(null)}
            onErrored={() => setRecaptchaToken(null)}
            hl={locale}
          />
        </div>

        <GoogleOAuthProvider clientId={googleClientId} locale={locale}>
          <div className={styles.googleButtonWrapper}>
            {recaptchaToken ? (
              <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
            ) : (
              <button type="button" disabled className={styles.disabledGoogleButton} aria-disabled="true">
                <FontAwesomeIcon icon={faGoogle} aria-hidden="true" />
                <span>{t('googleButton')}</span>
              </button>
            )}
          </div>
        </GoogleOAuthProvider>

        {isSubmitting && (
          <p role="status" className={styles.status}>
            <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
            <span>{t('signingIn')}</span>
          </p>
        )}

        {errorMessage && (
          <p role="alert" className={styles.error}>
            <FontAwesomeIcon icon={faCircleExclamation} aria-hidden="true" />
            <span>{errorMessage}</span>
          </p>
        )}

        {devAutoAuthEnabled && (
          <button type="button" onClick={handleDevBypass} className={styles.devBypassButton}>
            <FontAwesomeIcon icon={faFlask} aria-hidden="true" />
            <span>{t('devBypass')}</span>
          </button>
        )}

        {/* CC03/CC04: 利用規約とプライバシーポリシーへ、ログイン導線から到達できるようにする。 */}
        <p className={styles.legalLinks}>
          <Link href={`/${locale}/legal/terms`}>{tLegal('termsLink')}</Link>
          {' · '}
          <Link href={`/${locale}/legal/privacy`}>{tLegal('privacyLink')}</Link>
        </p>
      </div>
    </main>
  );
}
