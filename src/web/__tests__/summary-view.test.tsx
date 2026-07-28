import { act, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import SummaryView from '../components/summary/SummaryView';
import { AiSummaryQuotaExceededError, type AiSummary, type AiSummaryClient } from '../components/summary/aiSummaryClient';
import ja from '../locales/ja.json';
import en from '../locales/en.json';

function renderWithLocale(client: AiSummaryClient, messages: typeof ja = ja, locale = 'ja') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SummaryView client={client} />
    </NextIntlClientProvider>
  );
}

function makeSummary(overrides: Partial<AiSummary> = {}): AiSummary {
  return {
    quotaDate: '2026-07-28',
    summaryText: '倉庫Aは夕方から気温が上がりました。',
    generatedAt: '2026-07-28T10:00:00.000Z',
    dataSufficient: true,
    ...overrides,
  };
}

describe('SummaryView (Issue #22 きょうのまとめ)', () => {
  it('shows the idle state with the mandatory privacy notice when no summary exists yet', async () => {
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(null),
      generateSummary: jest.fn(),
    };

    renderWithLocale(client);

    await waitFor(() => expect(client.fetchTodaySummary).toHaveBeenCalled());

    expect(screen.getByRole('heading', { name: ja.summary.title, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(ja.summary.privacyNotice)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ja.summary.generateButton })).toBeInTheDocument();
  });

  it('requests a summary on button press and displays the generated text', async () => {
    const generated = makeSummary({ summaryText: '本日は異常がありませんでした。' });
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(null),
      generateSummary: jest.fn().mockResolvedValue(generated),
    };

    renderWithLocale(client);
    await waitFor(() => expect(client.fetchTodaySummary).toHaveBeenCalled());

    await act(async () => {
      screen.getByRole('button', { name: ja.summary.generateButton }).click();
    });

    expect(client.generateSummary).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(generated.summaryText)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: ja.summary.rereadButton })).toBeInTheDocument();
  });

  it('re-displays the saved summary when a second same-day request is rejected with a 429 (quota exceeded)', async () => {
    const existingSummary = makeSummary({ summaryText: '既に保存されているきょうのまとめです。' });
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(null),
      generateSummary: jest
        .fn()
        .mockRejectedValue(
          new AiSummaryQuotaExceededError({
            error: { code: 'quota_exceeded', message: 'already used' },
            existingSummary,
          })
        ),
    };

    renderWithLocale(client);
    await waitFor(() => expect(client.fetchTodaySummary).toHaveBeenCalled());

    await act(async () => {
      screen.getByRole('button', { name: ja.summary.generateButton }).click();
    });

    await waitFor(() => expect(screen.getByText(existingSummary.summaryText)).toBeInTheDocument());
    expect(screen.getByText(ja.summary.cachedNotice)).toBeInTheDocument();
  });

  it('shows the fixed insufficient-data notice when the API reports dataSufficient=false', async () => {
    const insufficientSummary = makeSummary({
      dataSufficient: false,
      summaryText: 'データがまだ十分にありません。',
    });
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(null),
      generateSummary: jest.fn().mockResolvedValue(insufficientSummary),
    };

    renderWithLocale(client);
    await waitFor(() => expect(client.fetchTodaySummary).toHaveBeenCalled());

    await act(async () => {
      screen.getByRole('button', { name: ja.summary.generateButton }).click();
    });

    await waitFor(() => expect(screen.getByText(insufficientSummary.summaryText)).toBeInTheDocument());
    expect(screen.getByText(ja.summary.insufficientDataNotice)).toBeInTheDocument();
  });

  it('pre-fills an already-generated today summary on mount without requiring a click', async () => {
    const existingSummary = makeSummary({ summaryText: '今朝すでに作成ずみのまとめです。' });
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(existingSummary),
      generateSummary: jest.fn(),
    };

    renderWithLocale(client);

    await waitFor(() => expect(screen.getByText(existingSummary.summaryText)).toBeInTheDocument());
    expect(client.generateSummary).not.toHaveBeenCalled();
  });

  it('switches every visible string to English when rendered with the English locale (i18n switch mechanism)', async () => {
    const client: AiSummaryClient = {
      fetchTodaySummary: jest.fn().mockResolvedValue(null),
      generateSummary: jest.fn(),
    };

    renderWithLocale(client, en, 'en');
    await waitFor(() => expect(client.fetchTodaySummary).toHaveBeenCalled());

    expect(screen.getByRole('heading', { name: en.summary.title, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(en.summary.privacyNotice)).toBeInTheDocument();
    expect(screen.queryByText(ja.summary.privacyNotice)).not.toBeInTheDocument();
  });
});
