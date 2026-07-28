'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AiSummaryQuotaExceededError,
  createMockAiSummaryClient,
  type AiSummary,
  type AiSummaryClient,
} from './aiSummaryClient';

type ViewStatus = 'idle' | 'loading' | 'done';

export interface SummaryViewProps {
  /**
   * Injection point for tests / a future real client. Defaults to the
   * in-memory stub (see aiSummaryClient.ts) since the backend for
   * Issue #13 is developed in parallel.
   */
  client?: AiSummaryClient;
}

export default function SummaryView({ client }: SummaryViewProps) {
  const t = useTranslations('summary');
  const clientRef = useRef<AiSummaryClient>(client ?? createMockAiSummaryClient());

  const [status, setStatus] = useState<ViewStatus>('idle');
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadExistingSummary() {
      try {
        const existing = await clientRef.current.fetchTodaySummary();
        if (!isMounted) {
          return;
        }
        if (existing) {
          setSummary(existing);
          setIsCached(true);
          setStatus('done');
        }
      } catch (error) {
        // Fetching today's (already generated) summary does not consume the
        // quota, so a failure here is a genuine transport/error condition,
        // not part of normal control flow. Fail loudly but keep the idle
        // screen usable (the user can still press the button).
        console.error('[SummaryView] failed to load today’s existing summary', error);
      }
    }

    void loadExistingSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleGenerateClick() {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const generated = await clientRef.current.generateSummary();
      setSummary(generated);
      setIsCached(false);
      setStatus('done');
    } catch (error) {
      if (error instanceof AiSummaryQuotaExceededError) {
        setSummary(error.existingSummary);
        setIsCached(true);
        setStatus('done');
        return;
      }

      console.error('[SummaryView] failed to generate daily summary', error);
      setErrorMessage(t('errorNotice'));
      setStatus('idle');
    }
  }

  const hasSummaryToday = summary !== null;
  const generateButtonLabel = hasSummaryToday ? t('rereadButton') : t('generateButton');
  const quotaNote = hasSummaryToday ? t('quotaNoteUsed') : t('quotaNoteUnused');

  return (
    <main>
      <p>{t('overline')}</p>
      <h1>{t('title')}</h1>

      <section aria-labelledby="summary-card-heading">
        <div>
          <h2 id="summary-card-heading">{t('cardTitle')}</h2>
          <p>{quotaNote}</p>
        </div>
        <button type="button" onClick={() => void handleGenerateClick()} disabled={status === 'loading'}>
          {generateButtonLabel}
        </button>

        {errorMessage && <p role="alert">{errorMessage}</p>}

        {status === 'loading' && <p>{t('loadingText')}</p>}

        {status === 'done' && summary && (
          <div>
            {isCached && <p>{t('cachedNotice')}</p>}
            {!summary.dataSufficient && <p>{t('insufficientDataNotice')}</p>}
            <p style={{ whiteSpace: 'pre-line' }}>{summary.summaryText}</p>
          </div>
        )}

        {status === 'idle' && !summary && (
          <div>
            <p>{t('idleDescriptionLine1')}</p>
            <p>{t('privacyNotice')}</p>
          </div>
        )}
      </section>
    </main>
  );
}
