import {
  AiSummaryQuotaExceededError,
  createAiSummaryApiClient,
} from '../components/summary/aiSummaryClient';
import { ApiError } from '../lib/api/apiClient';

/**
 * F7 AI日次サマリーのAPIクライアント（openapi.yaml getTodaySummary / generateDailySummary）。
 * かつてはこのモジュールがインメモリのスタブを提供していたが、Rails側は Issue #14 で
 * 実装済みであり撤去した。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as unknown as Response;
}

function noContentResponse(): Response {
  return {
    ok: true,
    status: 204,
    statusText: '204',
    json: async () => {
      throw new Error('204 responses have no body');
    },
  } as unknown as Response;
}

const SUMMARY = {
  quotaDate: '2026-07-29',
  summaryText: '倉庫Aは夕方から気温が上がりました。',
  generatedAt: '2026-07-29T12:00:00.000Z',
  dataSufficient: true,
};

describe('summary/aiSummaryClient', () => {
  describe('fetchTodaySummary', () => {
    it('生成済みのサマリーを返す', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(SUMMARY));

      const result = await createAiSummaryApiClient(fetchImpl).fetchTodaySummary();

      expect(result).toEqual(SUMMARY);
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/ai-summaries/today');
      expect(fetchImpl.mock.calls[0][1]).toEqual(
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });

    // 未生成は仕様上の正常な状態(204)であり、エラーでも空オブジェクトでもない。
    it('未生成(204)の場合はnullを返し、本文を読もうとしない', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(noContentResponse());

      await expect(createAiSummaryApiClient(fetchImpl).fetchTodaySummary()).resolves.toBeNull();
    });

    it('通信に失敗した場合はnullに丸めず例外を投げる(未生成と区別する)', async () => {
      const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(createAiSummaryApiClient(fetchImpl).fetchTodaySummary()).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('generateSummary', () => {
    it('生成を要求し、生成されたサマリーを返す', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(SUMMARY, 201));

      const result = await createAiSummaryApiClient(fetchImpl).generateSummary();

      expect(result).toEqual(SUMMARY);
      expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/ai-summaries');
      expect(fetchImpl.mock.calls[0][1]).toEqual(
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });

    // requirements.md F7-1: 同一クォータ日の2回目は429で、既存サマリーが併せて返る。
    // これは異常系ではなく仕様上の分岐なので、既存サマリーを保持した例外に翻訳する。
    it('同日2回目(429)は既存サマリーを持つ専用の例外に翻訳する', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(
        jsonResponse(
          {
            error: { code: 'quota_exceeded', message: '本日のAIサマリーは既に生成済みです。' },
            existingSummary: SUMMARY,
          },
          429
        )
      );

      const rejection = createAiSummaryApiClient(fetchImpl).generateSummary();

      await expect(rejection).rejects.toBeInstanceOf(AiSummaryQuotaExceededError);
      await expect(rejection).rejects.toMatchObject({ existingSummary: SUMMARY });
    });

    // AIサービス側の障害(502)を「クォータ超過」に丸めると、原因の切り分けができなくなる。
    it('AIサービス障害(502)はApiErrorのまま伝える', async () => {
      const fetchImpl = jest.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'ai_service_unavailable', message: '生成に失敗しました。' } }, 502)
      );

      const rejection = createAiSummaryApiClient(fetchImpl).generateSummary();

      await expect(rejection).rejects.toBeInstanceOf(ApiError);
      await expect(rejection).rejects.not.toBeInstanceOf(AiSummaryQuotaExceededError);
    });

    it('429でも既存サマリーが無い応答は、クォータ超過として扱わない', async () => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'too many' } }, 429));

      await expect(
        createAiSummaryApiClient(fetchImpl).generateSummary()
      ).rejects.not.toBeInstanceOf(AiSummaryQuotaExceededError);
    });
  });
});
