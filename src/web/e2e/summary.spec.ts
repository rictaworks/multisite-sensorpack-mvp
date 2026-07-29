import { expect, test } from '@playwright/test';
import { t } from './support/messages';

/**
 * F7 きょうのまとめ(AI日次サマリー) — Issue #22.
 *
 * components/summary/aiSummaryClient.ts's `createMockAiSummaryClient()` is a
 * pure in-memory mock (no network at all — see
 * WORK/2026-07-28-issue-22-daily-summary.md's residual-gap note that the
 * real Rails/FastAPI endpoint is still pending), and `app/[locale]/summary/page.tsx`
 * always renders `<SummaryView />` with no `client` prop, so this is the
 * real client the deployed app currently uses — this suite needs no
 * `page.route()` stubbing at all to exercise the full generate → quota-reuse
 * flow end to end.
 */
test.describe('きょうのまとめ(AI日次サマリー)', () => {
  test('生成→同日中の再読み込みでクォータ済み表示になり、同じ内容が再表示される', async ({ page }) => {
    await page.goto('/ja/summary');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'summary.title') })).toBeVisible();
    await expect(page.getByText(t('ja', 'summary.privacyNotice'))).toBeVisible();
    await expect(page.getByText(t('ja', 'summary.quotaNoteUnused'))).toBeVisible();

    const generateButton = page.getByRole('button', { name: t('ja', 'summary.generateButton') });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // Not asserting `summary.loadingText` here: createMockAiSummaryClient()
    // (components/summary/aiSummaryClient.ts) resolves generateSummary()
    // with no artificial delay at all, so the loading state is a single,
    // sub-frame-length React render that this suite cannot reliably observe
    // — asserting it would make this test flaky against real timing rather
    // than testing real behaviour.
    const rereadButton = page.getByRole('button', { name: t('ja', 'summary.rereadButton') });
    await expect(rereadButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(t('ja', 'summary.quotaNoteUsed'))).toBeVisible();

    const summaryTextLocator = page.locator('main p').filter({ hasText: '倉庫A' });
    await expect(summaryTextLocator).toBeVisible();
    const firstSummaryText = await summaryTextLocator.innerText();
    expect(firstSummaryText.length).toBeGreaterThan(0);

    // Same day, second request: the mock client throws
    // AiSummaryQuotaExceededError and SummaryView falls back to the
    // already-stored summary with `cachedNotice` shown instead of an error —
    // this is the app's real 429-equivalent handling, not a test stub.
    await rereadButton.click();
    await expect(page.getByText(t('ja', 'summary.cachedNotice'))).toBeVisible();
    await expect(summaryTextLocator).toHaveText(firstSummaryText);
  });
});
