import type { components } from '../../../shared/contracts/types/api';

/**
 * Re-exported from the API contract (Issue #5, `src/shared/contracts/openapi.yaml`)
 * so this screen never redefines the response shape locally
 * (`.claude/rules/architecture.md`: avoid reinventing the wheel).
 */
export type AiSummary = components['schemas']['AiSummary'];
export type AiSummaryQuotaExceededBody = components['schemas']['AiSummaryQuotaExceeded'];

/**
 * Thrown when `POST /ai-summaries` responds 429 because the daily quota
 * (1 request per quota date, JST 03:00 reset — requirements.md F7-1) has
 * already been consumed. Carries the previously generated summary so the
 * caller can re-display it, per Issue #22 acceptance criteria
 * ("同日2回目要求時は429を受けて保存済みサマリーを再表示する").
 */
export class AiSummaryQuotaExceededError extends Error {
  readonly existingSummary: AiSummary;

  constructor(body: AiSummaryQuotaExceededBody) {
    super(body.error.message);
    this.name = 'AiSummaryQuotaExceededError';
    this.existingSummary = body.existingSummary;
  }
}

/**
 * Client contract for the "今日のまとめ" screen. `SummaryView` depends on
 * this interface only, so it can be tested with fakes and later re-pointed
 * at a real `fetch()`-based implementation once the Rails endpoint
 * (Issue #13) is deployed, without touching the component.
 */
export interface AiSummaryClient {
  /** GET /ai-summaries/today — does not consume the daily quota. */
  fetchTodaySummary(): Promise<AiSummary | null>;
  /** POST /ai-summaries — may reject with {@link AiSummaryQuotaExceededError}. */
  generateSummary(): Promise<AiSummary>;
}

/**
 * クォータ日＝JSTの現在時刻から3時間引いた日付（requirements.md F7-1、
 * JST 03:00リセットと等価）。UTCのDateから直接計算することで、実行環境の
 * タイムゾーン設定に依存しない（CLAUDE.md: タイムゾーンは常にJST基準）。
 */
function computeJstQuotaDate(referenceDate: Date): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const QUOTA_RESET_SHIFT_MS = 3 * 60 * 60 * 1000;
  const shifted = new Date(referenceDate.getTime() + JST_OFFSET_MS - QUOTA_RESET_SHIFT_MS);
  return shifted.toISOString().slice(0, 10);
}

const SAMPLE_SUMMARY_TEXT =
  '倉庫Aは夕方から気温が上がり、17時ごろに29.4℃まで達しました。28℃の上限をこえていた時間はおよそ2時間で、' +
  'この間にファンが自動で回りはじめ、20時には範囲内に戻っています。\n' +
  '湿度は45〜62%の範囲で、注意が必要な変化はありませんでした。';

/**
 * In-memory stub standing in for the not-yet-deployed Rails endpoints
 * (`GET /ai-summaries/today`, `POST /ai-summaries` — Issue #13 is being
 * implemented in parallel). Issue #22's edit scope explicitly allows a
 * mock/stub API for this screen. Behaviour intentionally mirrors the
 * documented contract exactly (quota-day bookkeeping, 429 + existingSummary)
 * so that swapping in a real fetch-based client later is a drop-in change.
 *
 * State is held in a closure returned by this factory (never at module
 * scope), per `.claude/rules/coding-style.md`'s prohibition on global
 * variables — each call yields an independent, isolated client instance.
 */
export function createMockAiSummaryClient(): AiSummaryClient {
  let storedSummary: AiSummary | null = null;
  let storedQuotaDate: string | null = null;

  function hasSummaryForQuotaDate(quotaDate: string): boolean {
    return storedSummary !== null && storedQuotaDate === quotaDate;
  }

  return {
    async fetchTodaySummary(): Promise<AiSummary | null> {
      const quotaDate = computeJstQuotaDate(new Date());
      if (hasSummaryForQuotaDate(quotaDate)) {
        return storedSummary;
      }
      return null;
    },

    async generateSummary(): Promise<AiSummary> {
      const quotaDate = computeJstQuotaDate(new Date());

      if (hasSummaryForQuotaDate(quotaDate) && storedSummary) {
        console.debug('[aiSummaryClient] quota already used for quotaDate', quotaDate);
        throw new AiSummaryQuotaExceededError({
          error: {
            code: 'quota_exceeded',
            message: 'Daily AI summary quota already used for this quota date.',
          },
          existingSummary: storedSummary,
        });
      }

      const summary: AiSummary = {
        quotaDate,
        summaryText: SAMPLE_SUMMARY_TEXT,
        generatedAt: new Date().toISOString(),
        dataSufficient: true,
      };
      storedSummary = summary;
      storedQuotaDate = quotaDate;
      return summary;
    },
  };
}
