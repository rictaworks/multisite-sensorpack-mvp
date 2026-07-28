'use client';

import type { components } from '@contracts/api';

/**
 * Browser-side client for the auth session. It only ever calls the
 * same-origin `/api/auth/session` route (app/api/auth/session/route.ts),
 * never a raw Rails URL — the browser must never learn the backend's real
 * domain (.claude/rules/deploy.md: "バックエンドのドメインは隠蔽する").
 */

type SessionCreateResponseBody = components['schemas']['SessionCreateResponse'];

const SESSION_ENDPOINT = '/api/auth/session';

export class ClientSessionError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClientSessionError';
    this.status = status;
  }
}

export async function fetchCurrentSession(): Promise<SessionCreateResponseBody | null> {
  const response = await fetch(SESSION_ENDPOINT, { method: 'GET' });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new ClientSessionError(`Failed to fetch the current session: status ${response.status}`, response.status);
  }

  return (await response.json()) as SessionCreateResponseBody;
}

export async function signInWithGoogle(idToken: string, recaptchaToken: string): Promise<SessionCreateResponseBody> {
  const response = await fetch(SESSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, recaptchaToken }),
  });

  if (!response.ok) {
    throw new ClientSessionError(`Google sign-in was rejected: status ${response.status}`, response.status);
  }

  return (await response.json()) as SessionCreateResponseBody;
}

export async function signOutOfBackendSession(): Promise<void> {
  const response = await fetch(SESSION_ENDPOINT, { method: 'DELETE' });

  if (!response.ok && response.status !== 401) {
    throw new ClientSessionError(`Failed to sign out: status ${response.status}`, response.status);
  }
}
