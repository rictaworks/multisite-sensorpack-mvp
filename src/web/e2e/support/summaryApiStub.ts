import type { Page } from '@playwright/test';

/**
 * F7 きょうのまとめ(AI日次サマリー)画面が呼ぶRails APIを、Playwrightのネットワーク層で
 * スタブする。
 *
 * この画面は components/summary/aiSummaryClient.ts のインメモリのスタブを使うのをやめ、
 * 実API(`GET /ai-summaries/today` / `POST /ai-summaries`)へ結線した。
 *
 * このスイートはRailsの起動に依存しない方針のため、他のスタブと同じくブラウザの
 * ネットワーク層で応答を差し替える。アプリ側のフォールバックではなく、
 * 生成→クォータ消費→再表示の状態遷移はすべて実物のコンポーネントロジックが動く。
 *
 * クォータの挙動(同一クォータ日の2回目は429で既存サマリーを返す。requirements.md F7-1)を
 * 再現するため、このスタブ内で状態を持つ。状態はページごとのクロージャに閉じ込め、
 * モジュールスコープには置かない(.claude/rules/coding-style.md: グローバル変数禁止)。
 */

/** E2Eが本文の同一性を確認するために参照する固定のサマリー本文。 */
export const STUB_SUMMARY_TEXT =
  '倉庫Aは夕方から気温が上がり、17時ごろに29.4℃まで達しました。28℃の上限をこえていた時間はおよそ2時間で、' +
  'この間にファンが自動で回りはじめ、20時には範囲内に戻っています。';

export async function stubSummaryApi(page: Page): Promise<void> {
  let generated: { quotaDate: string; summaryText: string; generatedAt: string; dataSufficient: boolean } | null =
    null;

  await page.route('**/api/v1/ai-summaries/today', async (route) => {
    if (!generated) {
      // 未生成は正常な状態。契約どおり204(本文なし)を返す。
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(generated) });
  });

  await page.route('**/api/v1/ai-summaries', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    if (generated) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'quota_exceeded', message: '本日のAIサマリーは既に生成済みです。' },
          existingSummary: generated,
        }),
      });
      return;
    }

    generated = {
      quotaDate: '2026-07-29',
      summaryText: STUB_SUMMARY_TEXT,
      generatedAt: new Date().toISOString(),
      dataSufficient: true,
    };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(generated) });
  });
}
