import { ApiError, requestJson, requestOptionalJson } from '../../lib/api/apiClient';
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
 * 実API（`GET /ai-summaries/today` / `POST /ai-summaries`）を呼ぶクライアント。
 *
 * かつてはこの位置にインメモリのモックがあり、「Issue #13 のRails側が並行実装中のため
 * モック/スタブでよい」という前提で置かれていた。Rails側は Issue #14 で実装済みであり、
 * モックを残す理由が無くなったため撤去した。
 *
 * リクエストは同一オリジンの相対パスへ送り、Next.jsのサーバー側プロキシがRailsへ転送する。
 */
export function createAiSummaryApiClient(fetchImpl: typeof fetch = fetch): AiSummaryClient {
  return {
    /**
     * GET /ai-summaries/today — 未生成の場合、Railsは 204 (No Content) を返す。
     * 204は「まだ生成していない」という正常な状態であり、エラーではない。
     */
    async fetchTodaySummary(): Promise<AiSummary | null> {
      const response = await requestOptionalJson<AiSummary>({
        path: '/ai-summaries/today',
        method: 'GET',
        context: 'aiSummaryClient#fetchTodaySummary',
        fetchImpl,
      });
      return response;
    },

    /**
     * POST /ai-summaries — 同一クォータ日の2回目は 429 で、既存のサマリーが併せて返る
     * （requirements.md F7-1）。これは異常系ではなく仕様上の分岐なので、
     * 既存サマリーを持つ専用の例外に翻訳して呼び出し側が再表示できるようにする。
     */
    async generateSummary(): Promise<AiSummary> {
      try {
        return await requestJson<AiSummary>({
          path: '/ai-summaries',
          method: 'POST',
          context: 'aiSummaryClient#generateSummary',
          fetchImpl,
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'rate_limited' && error.body) {
          const body = error.body as Partial<AiSummaryQuotaExceededBody>;
          if (body.existingSummary && body.error) {
            throw new AiSummaryQuotaExceededError(body as AiSummaryQuotaExceededBody);
          }
        }
        throw error;
      }
    },
  };
}
