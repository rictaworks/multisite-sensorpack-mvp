'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ApiError } from '../../lib/api/apiClient';
import { fetchSites, type Site } from '../sites/api';
import { issueClaimCode, type ClaimCodeCreateResponse } from './api';
import RecaptchaField from './RecaptchaField';

type SitesState =
  | { status: 'loading' }
  | { status: 'ready'; sites: Site[] }
  | { status: 'error' };

type FieldErrors = {
  site?: string;
  name?: string;
  recaptcha?: string;
};

function formatRemaining(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function secondsUntil(isoDate: string): number {
  const diffMs = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.round(diffMs / 1000));
}

/**
 * F1 device-claim screen (requirements.md 1.6 F1, app-ui/SensorPack Dashboard.dc.html
 * "センサーパックを追加する" screen — reference only, not edited directly).
 *
 * Scope note (WORK/ report has the full write-up): this component covers the two
 * acceptance-tested steps — picking a site + issuing a claim code, and displaying
 * the issued code/expiry. It intentionally does NOT fabricate the mock's third
 * "つながりました" auto-success step: detecting that the physical device actually
 * connected needs backend support (Issue #8) that does not exist yet, and faking
 * that transition would violate the "no fallback / no fake success" coding rule.
 */
export default function DeviceClaimView() {
  const t = useTranslations('deviceClaim');
  const locale = useLocale();

  const [sitesState, setSitesState] = useState<SitesState>({ status: 'loading' });
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [issued, setIssued] = useState<ClaimCodeCreateResponse | null>(null);
  // Purely a re-render trigger for the countdown below — the actual remaining
  // time is always recomputed from `Date.now()` at render time (see
  // `remainingSeconds`), so this never needs to hold the "real" value itself
  // (avoids calling setState synchronously inside the effect body).
  const [, tick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSites()
      .then((sites) => {
        if (cancelled) return;
        setSitesState({ status: 'ready', sites });
        if (sites.length > 0) {
          setSelectedSiteId(sites[0].id);
        }
      })
      .catch((error: unknown) => {
        console.error('[DeviceClaimView] failed to load sites', error);
        if (!cancelled) {
          setSitesState({ status: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!issued) return undefined;
    const intervalId = setInterval(() => {
      tick((n) => n + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [issued]);

  const remainingSeconds = issued ? secondsUntil(issued.expiresAt) : 0;

  const errorMessageForApiError = useCallback(
    (error: ApiError): string => {
      switch (error.code) {
        case 'validation_error':
          return t('errors.validation');
        case 'unauthorized':
          return t('errors.unauthorized');
        case 'forbidden':
          return t('errors.forbidden');
        case 'rate_limited':
          return t('errors.rateLimited');
        default:
          return t('errors.network');
      }
    },
    [t]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextFieldErrors: FieldErrors = {};
      if (selectedSiteId == null) {
        nextFieldErrors.site = t('errors.siteRequired');
      }
      if (deviceLabel.trim().length === 0) {
        nextFieldErrors.name = t('errors.nameRequired');
      }
      if (!recaptchaToken) {
        nextFieldErrors.recaptcha = t('errors.recaptchaRequired');
      }

      setFieldErrors(nextFieldErrors);
      setSubmitError(null);

      if (Object.keys(nextFieldErrors).length > 0 || selectedSiteId == null || !recaptchaToken) {
        return;
      }

      setSubmitting(true);
      try {
        const response = await issueClaimCode({
          siteId: selectedSiteId,
          recaptchaToken,
        });
        setIssued(response);
      } catch (error) {
        if (error instanceof ApiError) {
          setSubmitError(errorMessageForApiError(error));
        } else {
          console.error('[DeviceClaimView] unexpected error issuing claim code', error);
          setSubmitError(t('errors.network'));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [selectedSiteId, deviceLabel, recaptchaToken, errorMessageForApiError, t]
  );

  const handleReissue = useCallback(() => {
    setIssued(null);
    setRecaptchaToken(null);
    setFieldErrors({});
    setSubmitError(null);
  }, []);

  return (
    <main>
      <Link href={`/${locale}`}>{t('backToHome')}</Link>
      <p>{t('eyebrow')}</p>
      <h1>{t('title')}</h1>

      <ol aria-label={t('title')}>
        <li aria-current={!issued ? 'step' : undefined}>{t('steps.selectSite')}</li>
        <li aria-current={issued && remainingSeconds > 0 ? 'step' : undefined}>
          {t('steps.issueCode')}
        </li>
        <li>{t('steps.connect')}</li>
      </ol>

      {issued && remainingSeconds > 0 ? (
        <section data-testid="claim-issued">
          <p>{t('issued.instructions')}</p>
          <div>
            <span>{t('issued.codeLabel')}</span>
            <strong data-testid="claim-code">{issued.code}</strong>
          </div>
          <p>{t('issued.expiresIn', { time: formatRemaining(remainingSeconds) })}</p>
          <p>{t('issued.waiting')}</p>
          <p>{t('issued.attemptsNote')}</p>
        </section>
      ) : issued ? (
        <section data-testid="claim-expired">
          <p>{t('issued.expired')}</p>
          <button type="button" onClick={handleReissue}>
            {t('issued.reissue')}
          </button>
        </section>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend>{t('form.siteLabel')}</legend>
            {sitesState.status === 'loading' && <p>…</p>}
            {sitesState.status === 'error' && <p role="alert">{t('form.sitesLoadError')}</p>}
            {sitesState.status === 'ready' && sitesState.sites.length === 0 && (
              <p>
                {t('form.siteEmpty')}{' '}
                {/* 拠点が無いとこの画面では先に進めないため、作成画面(Issue #61)へ導く。 */}
                <Link href={`/${locale}/sites`}>{t('form.createSiteLink')}</Link>
              </p>
            )}
            {sitesState.status === 'ready' &&
              sitesState.sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  aria-pressed={site.id === selectedSiteId}
                  onClick={() => setSelectedSiteId(site.id)}
                >
                  {site.name}
                </button>
              ))}
            {fieldErrors.site && <p role="alert">{fieldErrors.site}</p>}
          </fieldset>

          <label>
            <span>{t('form.nameLabel')}</span>
            <input
              type="text"
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
              placeholder={t('form.namePlaceholder')}
            />
            <span>{t('form.nameHint')}</span>
          </label>
          {fieldErrors.name && <p role="alert">{fieldErrors.name}</p>}

          <RecaptchaField onVerify={setRecaptchaToken} />
          {fieldErrors.recaptcha && <p role="alert">{fieldErrors.recaptcha}</p>}

          {submitError && <p role="alert">{submitError}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? t('form.submitting') : t('form.submit')}
          </button>
        </form>
      )}
    </main>
  );
}
