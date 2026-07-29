import { expect, test } from '@playwright/test';
import { t } from './support/messages';
import { stubSummaryApi } from './support/summaryApiStub';

/**
 * F7 きょうのまとめ(AI日次サマリー) — Issue #22.
 *
 * この画面は実API(`GET /ai-summaries/today` / `POST /ai-summaries`)へ結線しており、
 * かつてのインメモリのスタブ(createMockAiSummaryClient)は撤去した。
 * このスイートはRailsの起動に依存しない方針のため、応答は support/summaryApiStub.ts が
 * ブラウザのネットワーク層で差し替える(アプリ側のフォールバックではない)。
 * 生成→クォータ消費→再表示の状態遷移はすべて実物のコンポーネントロジックが動く。
 */
test.describe('きょうのまとめ(AI日次サマリー)', () => {
  test.beforeEach(async ({ page }) => {
    await stubSummaryApi(page);
  });

  test('生成→同日中の再読み込みでクォータ済み表示になり、同じ内容が再表示される', async ({ page }) => {
    await page.goto('/ja/summary');

    await expect(page.getByRole('heading', { level: 1, name: t('ja', 'summary.title') })).toBeVisible();
    await expect(page.getByText(t('ja', 'summary.privacyNotice'))).toBeVisible();
    await expect(page.getByText(t('ja', 'summary.quotaNoteUnused'))).toBeVisible();

    const generateButton = page.getByRole('button', { name: t('ja', 'summary.generateButton') });
    await expect(generateButton).toBeVisible();
    await generateButton.click();

    // `summary.loadingText` は検証しない: スタブが即座に応答するため、読み込み中の
    // 状態は1フレーム未満で消える。ここで検証するとタイミング依存の不安定なテストになる。
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
