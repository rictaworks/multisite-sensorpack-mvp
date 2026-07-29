import { NextRequest } from 'next/server';

import { proxyToBackend } from '../../../../lib/api/backendProxy';

/**
 * Same-origin entry point for every Rails `/api/v1/*` endpoint (Issue #53 A-4).
 *
 * The browser calls `/api/v1/...` on the Next.js origin; the actual call to Rails
 * happens server-side in lib/api/backendProxy.ts, so the deploy platform's raw
 * backend hostname is never exposed (.claude/rules/deploy.md).
 *
 * The session-cookie endpoints keep their dedicated handler
 * (app/api/auth/session/route.ts) because they live outside `/api/v1` and need
 * request/response shape validation of their own.
 */

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyToBackend(request, path);
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<Response> {
  return handle(request, context);
}
