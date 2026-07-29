import { ApiError } from '../lib/api/apiClient';
import { issueClaimCode } from '../components/claim/api';

/**
 * F1 クレームコード発行のAPIクライアント。
 *
 * 拠点一覧の取得は components/sites/api.ts へ移動したため(Issue #61: `/sites` 系の操作を
 * 1モジュールに集約)、その検証は __tests__/sites-api.test.ts にある。
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

describe('claim/api', () => {
  it('issueClaimCode posts siteId and recaptchaToken and returns the issued code', async () => {
    const expiresAt = '2026-07-28T00:15:00.000Z';
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ code: 'AB12CD34', expiresAt }, 201));

    const result = await issueClaimCode({ siteId: 1, recaptchaToken: 'token-abc' }, fetchImpl);

    expect(result).toEqual({ code: 'AB12CD34', expiresAt });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/claim-codes',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ siteId: 1, recaptchaToken: 'token-abc' }),
      })
    );
  });

  it('issueClaimCode throws a rate_limited ApiError on 429 (reCAPTCHA/rate-limit rejection)', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429));

    await expect(issueClaimCode({ siteId: 1, recaptchaToken: 'x' }, fetchImpl)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'slow down',
    });
  });

  it('issueClaimCode wraps a transport failure as a network_error ApiError (no fallback data)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('network down'));

    await expect(issueClaimCode({ siteId: 1, recaptchaToken: 'x' }, fetchImpl)).rejects.toBeInstanceOf(ApiError);
    await expect(issueClaimCode({ siteId: 1, recaptchaToken: 'x' }, fetchImpl)).rejects.toMatchObject({
      code: 'network_error',
    });
  });
});
