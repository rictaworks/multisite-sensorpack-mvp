import { ClaimApiError, fetchSites, issueClaimCode } from '../components/claim/api';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

describe('claim/api', () => {
  it('fetchSites returns the sites array on success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        sites: [
          {
            id: 1,
            name: '倉庫A',
            deviceCount: 0,
            onlineDeviceCount: 0,
            openAlertCount: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })
    );

    const sites = await fetchSites(fetchImpl);

    expect(sites).toHaveLength(1);
    expect(sites[0].name).toBe('倉庫A');
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/sites',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('fetchSites throws a ClaimApiError classified as unauthorized on 401', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 'unauthorized', message: 'no session' } }, 401));

    await expect(fetchSites(fetchImpl)).rejects.toMatchObject({
      name: 'ClaimApiError',
      status: 401,
      code: 'unauthorized',
    });
  });

  it('fetchSites wraps a transport failure as a network_error ClaimApiError (no fallback data)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('network down'));

    await expect(fetchSites(fetchImpl)).rejects.toBeInstanceOf(ClaimApiError);
    await expect(fetchSites(fetchImpl)).rejects.toMatchObject({ code: 'network_error' });
  });

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

  it('issueClaimCode throws a rate_limited ClaimApiError on 429 (reCAPTCHA/rate-limit rejection)', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429));

    await expect(issueClaimCode({ siteId: 1, recaptchaToken: 'x' }, fetchImpl)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
      message: 'slow down',
    });
  });
});
