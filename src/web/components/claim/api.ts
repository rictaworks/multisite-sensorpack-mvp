/**
 * Thin fetch wrapper for the F1 device-claim flow (requirements.md 1.6 F1).
 *
 * Per src/shared/contracts/CONTRACT.md ("Next.js（Web）" section), API request/response
 * shapes are imported directly from the generated OpenAPI types instead of being
 * re-declared here (avoids re-inventing the contract, .claude/rules/architecture.md).
 *
 * Requests target a same-origin relative path (`/api/v1/...`) and are forwarded to
 * Rails server-side by app/api/v1/[...path]/route.ts, so this module never talks to a
 * Rails host directly (.claude/rules/deploy.md).
 *
 * The transport itself (headers, credentials, error classification) lives in
 * lib/api/apiClient.ts, shared with the site-management screen (Issue #61).
 * The site listing used by the picker below comes from components/sites/api.ts,
 * which owns every `/sites` operation.
 */
import { requestJson } from '../../lib/api/apiClient';
import type { components } from '../../../shared/contracts/types/api';

export type ClaimCodeCreateResponse = components['schemas']['ClaimCodeCreateResponse'];

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

  return requestJson<ClaimCodeCreateResponse>({
    path: '/claim-codes',
    method: 'POST',
    body: requestBody,
    context: 'claim/api#issueClaimCode',
    fetchImpl,
  });
}
