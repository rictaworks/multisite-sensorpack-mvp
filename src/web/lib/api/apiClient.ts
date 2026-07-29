/**
 * Shared browser-side fetch plumbing for the Rails API (`/api/v1/*`).
 *
 * Requests always target a same-origin relative path; the Next.js route handler
 * (app/api/v1/[...path]/route.ts) forwards them server-side, so no browser-side
 * module ever learns the real Rails host (.claude/rules/deploy.md).
 *
 * Extracted from components/claim/api.ts when the site-management screen needed the
 * same error classification (Issue #61) — one copy of "how an API failure becomes a
 * typed error" rather than one per feature (.claude/development-principles.md: DRY).
 */

const API_BASE_PATH = '/api/v1';

/** Machine-readable error codes as defined by components.schemas.Error in openapi.yaml. */
export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'network_error'
  | 'unknown_error';

/**
 * Thrown for any non-2xx response (or transport failure).
 * Callers map `status`/`code` to a localized message — we never guess or
 * fabricate a success state on failure (no fallback, .claude/rules/coding-style.md).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /**
   * パース済みのエラーレスポンス本文。
   *
   * 契約上、エラー応答が `error` 以外の情報を含むことがある（例: AIサマリーの429は
   * 既に生成済みの `existingSummary` を併せて返す）。メッセージだけに畳むとその情報が
   * 失われ、呼び出し側が仕様どおりの再表示をできなくなるため保持する。
   * 本文がJSONでなかった場合は undefined。
   */
  readonly body?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function classifyStatus(status: number): ApiErrorCode {
  if (status === 400) return 'validation_error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return 'unknown_error';
}

async function throwForFailedResponse(response: Response, context: string): Promise<never> {
  let message = response.statusText || `HTTP ${response.status}`;
  let body: unknown;
  try {
    body = await response.json();
    const parsed = body as { error?: { code?: string; message?: string } };
    if (parsed?.error?.message) {
      message = parsed.error.message;
    }
  } catch (parseError) {
    // The error body was not valid JSON (e.g. an upstream proxy/network failure
    // returned an HTML error page). We deliberately log this instead of silently
    // swallowing it, per .claude/rules/coding-style.md ("デバッグトレースができるように").
    console.error(`[${context}] failed to parse error response body`, parseError);
  }
  throw new ApiError(response.status, classifyStatus(response.status), message, body);
}

type RequestOptions = {
  /** Path relative to `/api/v1`, e.g. `/sites` or `/sites/1`. */
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Already-serialized JSON body, if the method carries one. */
  body?: unknown;
  /** Prefix used in log lines so a failure can be traced back to its caller. */
  context: string;
  fetchImpl: typeof fetch;
};

async function send(options: RequestOptions): Promise<Response> {
  const { path, method, body, context, fetchImpl } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_PATH}${path}`, {
      method,
      // The Rails session cookie is set on this same origin by the /auth/session
      // proxy; without it every call comes back 401.
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (networkError) {
    console.error(`[${context}] network failure`, networkError);
    throw new ApiError(0, 'network_error', 'network_error');
  }

  if (!response.ok) {
    await throwForFailedResponse(response, context);
  }

  return response;
}

/** Sends a request and parses the JSON response body. */
export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const response = await send(options);
  return (await response.json()) as T;
}

/**
 * Sends a request that succeeds with no response body (HTTP 204).
 * Parsing a body here would throw on an empty payload, turning a successful
 * delete into a spurious failure.
 */
export async function requestNoContent(options: RequestOptions): Promise<void> {
  await send(options);
}

/**
 * Sends a request whose success response is either a JSON body or 204 No Content,
 * returning `null` for the latter.
 *
 * 204 is used by the contract to mean "this resource legitimately does not exist yet"
 * (e.g. today's AI summary before it has been generated). That is a normal state, not
 * a failure — but it is also not an empty object, so callers must be able to tell the
 * two apart rather than receiving a fabricated placeholder.
 */
export async function requestOptionalJson<T>(options: RequestOptions): Promise<T | null> {
  const response = await send(options);
  if (response.status === 204) {
    return null;
  }
  return (await response.json()) as T;
}
