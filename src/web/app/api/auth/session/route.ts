import { NextRequest, NextResponse } from 'next/server';
import {
  BackendSessionError,
  createBackendSession,
  deleteBackendSession,
  getBackendSession,
} from '../../../../lib/auth/backendSession';

/**
 * Same-origin proxy for the Rails `/auth/session` endpoint
 * (src/shared/contracts/openapi.yaml, securityScheme `googleSessionCookie`).
 *
 * The browser only ever talks to THIS route (same origin as the Next.js
 * app). It never learns the real Rails host, satisfying
 * .claude/rules/deploy.md ("バックエンドのドメインは隠蔽する"). All actual
 * network calls to Rails happen server-side in lib/auth/backendSession.ts.
 */

function errorResponse(error: unknown): NextResponse {
  if (error instanceof BackendSessionError) {
    return NextResponse.json(
      { error: { code: 'backend_session_error', message: error.message } },
      { status: error.status }
    );
  }

  // Fail fast/loud: unexpected errors are not swallowed here
  // (.claude/rules/coding-style.md: フォールバック処理を書かない).
  throw error;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie');

  try {
    const session = await getBackendSession(cookieHeader);
    if (!session) {
      return NextResponse.json(
        { error: { code: 'invalid_session', message: 'No active session.' } },
        { status: 401 }
      );
    }
    return NextResponse.json(session, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie');

  let payload: { idToken?: unknown; recaptchaToken?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Request body must be valid JSON.' } },
      { status: 400 }
    );
  }

  if (typeof payload.idToken !== 'string' || typeof payload.recaptchaToken !== 'string') {
    return NextResponse.json(
      {
        error: {
          code: 'validation_error',
          message: 'idToken and recaptchaToken are both required string fields.',
        },
      },
      { status: 400 }
    );
  }

  try {
    const { body, setCookie } = await createBackendSession(payload.idToken, payload.recaptchaToken, cookieHeader);
    const response = NextResponse.json(body, { status: 200 });
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie');

  try {
    await deleteBackendSession(cookieHeader);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
