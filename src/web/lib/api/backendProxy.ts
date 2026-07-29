import 'server-only';
import { NextRequest } from 'next/server';

import { getBackendApiBaseUrl } from './backendBaseUrl';

/**
 * Server-side proxy for the Rails `/api/v1/*` endpoints (Issue #53 A-4).
 *
 * The browser only ever calls same-origin relative paths (`/api/v1/...`, see
 * components/claim/api.ts). Every actual request to Rails happens here, so the
 * deploy platform's raw hostname never reaches the browser
 * (.claude/rules/deploy.md: "バックエンドのドメインは隠蔽する").
 *
 * Both directions use an allow-list rather than "copy everything except X":
 * a deny-list silently starts leaking whenever the platform introduces a new
 * header (Via, X-Served-By, ...), which is exactly the failure this rule exists
 * to prevent.
 */

/** Request headers forwarded to Rails. `host` is deliberately absent: forwarding the
 *  Next.js host would make Rails' own host authorization (config.hosts, Issue #53 A-1)
 *  evaluate the frontend domain instead of its own. */
const FORWARDED_REQUEST_HEADERS = [
  'cookie',
  'content-type',
  'accept',
  'accept-language',
  'authorization',
] as const;

/** Response headers returned to the browser. Location/Via/X-* are intentionally
 *  excluded because they can carry the backend origin. */
const FORWARDED_RESPONSE_HEADERS = [ 'content-type', 'cache-control' ] as const;

/** Methods that carry a request body. */
const METHODS_WITH_BODY = [ 'POST', 'PUT', 'PATCH' ];

const BACKEND_API_PREFIX = '/api/v1';

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function buildTargetUrl(baseUrl: string, path: string[], search: string): string {
  // Path segments come from the Next.js dynamic route, which has already decoded
  // them; re-encode so a segment can never inject a new path or query.
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  return `${baseUrl}${BACKEND_API_PREFIX}/${encodedPath}${search}`;
}

/**
 * Returns a 502 without echoing the failure detail to the browser.
 *
 * The detail is logged instead: it names the backend origin (or the fact that it is
 * unset), which is precisely what must not be exposed. This is not a fallback that
 * hides the problem — the request fails loudly, and the cause stays traceable in the
 * server logs (.claude/rules/coding-style.md: デバッグトレースができるように).
 */
function badGatewayResponse(reason: unknown): Response {
  console.error('[api/v1 proxy] request to the Rails backend failed', reason);
  return new Response(
    JSON.stringify({ error: { code: 'backend_unavailable' } }),
    { status: 502, headers: { 'content-type': 'application/json' } }
  );
}

export async function proxyToBackend(request: NextRequest, path: string[]): Promise<Response> {
  let targetUrl: string;
  try {
    targetUrl = buildTargetUrl(getBackendApiBaseUrl(), path, request.nextUrl.search);
  } catch (configurationError) {
    return badGatewayResponse(configurationError);
  }

  const method = request.method.toUpperCase();

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method,
      headers: buildForwardHeaders(request),
      body: METHODS_WITH_BODY.includes(method) ? await request.text() : undefined,
      // Following a redirect server-side could send the request (and its session
      // cookie) somewhere unintended; surface it as a plain response instead.
      redirect: 'manual',
    });
  } catch (networkError) {
    return badGatewayResponse(networkError);
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = backendResponse.headers.get(name);
    if (value !== null) {
      responseHeaders.set(name, value);
    }
  }
  // Set-Cookie may legitimately appear more than once and must not be joined into
  // a single header, so it is copied separately from the allow-list above.
  for (const setCookie of backendResponse.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', setCookie);
  }

  // Status and body pass through unchanged: the frontend maps Rails' machine-readable
  // error codes itself (components/claim/api.ts), so rewriting them here would
  // destroy information (.claude/rules/coding-style.md: フォールバック処理を書かない).
  return new Response(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}
