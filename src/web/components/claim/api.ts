/**
 * Thin fetch wrapper for the F1 device-claim flow (requirements.md 1.6 F1).
 *
 * Per src/shared/contracts/CONTRACT.md ("Next.js（Web）" section), API request/response
 * shapes are imported directly from the generated OpenAPI types instead of being
 * re-declared here (avoids re-inventing the contract, .claude/rules/architecture.md).
 *
 * Requests target a same-origin relative path (`/api/v1/...`). Per .claude/rules/deploy.md
 * the real Rails backend domain must stay hidden behind a Next.js proxy/rewrite in
 * production; this module never talks to a Rails host directly.
 */
import type { components, paths } from '../../../shared/contracts/types/api';

export type Site = components['schemas']['Site'];
export type ClaimCodeCreateResponse = components['schemas']['ClaimCodeCreateResponse'];

const API_BASE_PATH = '/api/v1';

/** Machine-readable error codes as defined by components.schemas.Error in openapi.yaml. */
export type ClaimApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'network_error'
  | 'unknown_error';

/**
 * Thrown for any non-2xx response (or transport failure) from the claim API.
 * Callers map `status`/`code` to a localized message — we never guess or
 * fabricate a success state on failure (no fallback, .claude/rules/coding-style.md).
 */
export class ClaimApiError extends Error {
  readonly status: number;
  readonly code: ClaimApiErrorCode;

  constructor(status: number, code: ClaimApiErrorCode, message: string) {
    super(message);
    this.name = 'ClaimApiError';
    this.status = status;
    this.code = code;
  }
}

function classifyStatus(status: number): ClaimApiErrorCode {
  if (status === 400) return 'validation_error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'unknown_error';
}

async function throwForFailedResponse(response: Response): Promise<never> {
  let message = response.statusText || `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.message) {
      message = body.error.message;
    }
  } catch (parseError) {
    // The error body was not valid JSON (e.g. an upstream proxy/network failure
    // returned an HTML error page). We deliberately log this instead of silently
    // swallowing it, per .claude/rules/coding-style.md ("デバッグトレースができるように").
    console.error('[claim/api] failed to parse error response body', parseError);
  }
  throw new ClaimApiError(response.status, classifyStatus(response.status), message);
}

/**
 * Fetches the caller's own sites (GET /sites) so the claim form can offer a
 * site picker. Requires an authenticated session (Issue #17); an expired/missing
 * session surfaces as a 401 ClaimApiError for the caller to handle explicitly.
 */
export async function fetchSites(
  fetchImpl: typeof fetch = fetch
): Promise<Site[]> {
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_PATH}/sites`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (networkError) {
    console.error('[claim/api] fetchSites network failure', networkError);
    throw new ClaimApiError(0, 'network_error', 'network_error');
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }

  const body = (await response.json()) as paths['/sites']['get']['responses']['200']['content']['application/json'];
  return body.sites;
}

export type IssueClaimCodeInput = {
  siteId: number;
  recaptchaToken: string;
};

/**
 * Issues a claim code (POST /claim-codes). The backend re-verifies the reCAPTCHA
 * token server-side (requirements.md 1.6 F1手順1-2) — the frontend never treats
 * a locally-collected token as sufficient on its own.
 */
export async function issueClaimCode(
  input: IssueClaimCodeInput,
  fetchImpl: typeof fetch = fetch
): Promise<ClaimCodeCreateResponse> {
  const requestBody: components['schemas']['ClaimCodeCreateRequest'] = {
    siteId: input.siteId,
    recaptchaToken: input.recaptchaToken,
  };

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_PATH}/claim-codes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (networkError) {
    console.error('[claim/api] issueClaimCode network failure', networkError);
    throw new ClaimApiError(0, 'network_error', 'network_error');
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }

  return (await response.json()) as ClaimCodeCreateResponse;
}
