import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { components } from '@contracts/api';
import { getBackendSession } from './backendSession';

/**
 * Reusable "認証状態管理(セッション保持・未認証リダイレクト)" building block
 * (Issue #17). No protected dashboard page exists in this repository yet
 * (those are being built in separate, in-flight frontend issues), so this
 * module is the piece those pages will call into: an async Server Component
 * page starts with `const session = await requireSession(locale);` and gets
 * redirected to the locale-prefixed login page automatically when there is
 * no valid Rails session cookie.
 */

type SessionCreateResponseBody = components['schemas']['SessionCreateResponse'];

function buildCookieHeader(cookieEntries: Array<{ name: string; value: string }>): string | null {
  if (cookieEntries.length === 0) {
    return null;
  }
  return cookieEntries.map(({ name, value }) => `${name}=${value}`).join('; ');
}

export async function getServerSession(): Promise<SessionCreateResponseBody | null> {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore.getAll());

  if (!cookieHeader) {
    // No cookies at all: skip the network round-trip, there cannot be a
    // valid session_id cookie to check.
    return null;
  }

  return getBackendSession(cookieHeader);
}

export async function requireSession(locale: string): Promise<SessionCreateResponseBody> {
  const session = await getServerSession();

  if (!session) {
    redirect(`/${locale}/login`);
  }

  return session;
}
