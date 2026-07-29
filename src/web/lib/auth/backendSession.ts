import 'server-only';
import type { components } from '@contracts/api';

import { getBackendApiBaseUrl } from '../api/backendBaseUrl';

/**
 * The ONLY module in src/web allowed to talk to the real Rails backend for
 * the Google-login session flow (src/shared/contracts/openapi.yaml
 * `/auth/session`, securityScheme `googleSessionCookie`).
 *
 * - Imports `server-only` so any accidental import from a client component
 *   fails the build loudly instead of leaking `BACKEND_API_BASE_URL` (a
 *   server-only secret-ish config value) into the browser bundle
 *   (.claude/rules/deploy.md: "バックエンドのドメインは隠蔽する").
 * - Resolves its base URL through lib/api/backendBaseUrl.ts, shared with the
 *   `/api/v1/*` proxy so the rule (read from the environment, never hardcoded,
 *   no fallback when unset) lives in exactly one place.
 * - Reuses the shared OpenAPI-generated types (`@contracts/api`, aliasing
 *   src/shared/contracts/types/api.ts) instead of redefining the request/
 *   response shape (src/shared/contracts/CONTRACT.md "Next.js（Web）"
 *   section: "API形状をコンポーネント側で再定義しない").
 */

type SessionCreateResponseBody = components['schemas']['SessionCreateResponse'];

export class BackendSessionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BackendSessionError';
    this.status = status;
  }
}

function buildForwardHeaders(incomingCookieHeader: string | null): Record<string, string> {
  return incomingCookieHeader ? { Cookie: incomingCookieHeader } : {};
}

export async function createBackendSession(
  idToken: string,
  recaptchaToken: string,
  incomingCookieHeader: string | null
): Promise<{ body: SessionCreateResponseBody; setCookie: string | null }> {
  const baseUrl = getBackendApiBaseUrl();
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildForwardHeaders(incomingCookieHeader),
    },
    body: JSON.stringify({ idToken, recaptchaToken }),
  });

  if (!response.ok) {
    throw new BackendSessionError(
      `Failed to create backend session (Google ID token / reCAPTCHA rejected): status ${response.status}`,
      response.status
    );
  }

  const body = (await response.json()) as SessionCreateResponseBody;
  return { body, setCookie: response.headers.get('set-cookie') };
}

export async function getBackendSession(
  incomingCookieHeader: string | null
): Promise<SessionCreateResponseBody | null> {
  const baseUrl = getBackendApiBaseUrl();
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: 'GET',
    headers: buildForwardHeaders(incomingCookieHeader),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new BackendSessionError(`Failed to fetch backend session: status ${response.status}`, response.status);
  }

  return (await response.json()) as SessionCreateResponseBody;
}

export async function deleteBackendSession(incomingCookieHeader: string | null): Promise<void> {
  const baseUrl = getBackendApiBaseUrl();
  const response = await fetch(`${baseUrl}/auth/session`, {
    method: 'DELETE',
    headers: buildForwardHeaders(incomingCookieHeader),
  });

  // An already-expired/absent session (401) is not an error for a logout call.
  if (!response.ok && response.status !== 401) {
    throw new BackendSessionError(`Failed to delete backend session: status ${response.status}`, response.status);
  }
}
