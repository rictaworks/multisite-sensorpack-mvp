'use client';

import { useTranslations } from 'next-intl';
import ReCAPTCHA from 'react-google-recaptcha';

type RecaptchaFieldProps = {
  onVerify: (token: string | null) => void;
};

/**
 * Wraps the real Google reCAPTCHA v2 checkbox widget (react-google-recaptcha —
 * a maintained OSS wrapper, .claude/rules/architecture.md: avoid reinventing bot
 * detection ourselves).
 *
 * If the site key env var is missing we fail closed: we show a visible notice
 * and never synthesize a fake passing token. A missing token keeps the submit
 * button disabled upstream (.claude/rules/coding-style.md: no fallback).
 */
export default function RecaptchaField({ onVerify }: RecaptchaFieldProps) {
  const t = useTranslations('deviceClaim.form');
  // requirements.md 8節: reCAPTCHA is a mandatory MVP requirement on this form.
  // Read at render time (not module scope) — Next.js inlines NEXT_PUBLIC_* vars
  // by textual replacement wherever they are referenced in client code, and
  // reading it here (rather than in a module-level const) keeps this testable.
  const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!RECAPTCHA_SITE_KEY) {
    console.error('[RecaptchaField] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not configured');
    return (
      <div role="alert" data-testid="recaptcha-unconfigured">
        {t('recaptchaUnconfigured')}
      </div>
    );
  }

  return (
    <div data-testid="recaptcha-field">
      <ReCAPTCHA
        sitekey={RECAPTCHA_SITE_KEY}
        onChange={(token) => onVerify(token)}
        onExpired={() => onVerify(null)}
        onErrored={() => onVerify(null)}
      />
      <p>{t('recaptchaHint')}</p>
    </div>
  );
}
