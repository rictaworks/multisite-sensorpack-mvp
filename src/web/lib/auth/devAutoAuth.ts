import { isDevAutoAuthEnabled } from './environment';

/**
 * Development-only authentication bypass (.claude/rules/environment.md:
 * "テスト・開発を容易にするため、開発環境に限り「認証済み」の状態に自動分岐してよい").
 *
 * This is intentionally NOT a real session: it never talks to Google or to
 * the Rails backend (googleSessionCookie in src/shared/contracts/openapi.yaml
 * is left untouched). It only flips a local marker the dev build can read to
 * skip the login screen while iterating locally. Because it is local-only
 * and gated by isDevAutoAuthEnabled() (single source of truth,
 * lib/auth/environment.ts), it can never grant access to any real backend
 * resource even if invoked.
 *
 * Defense in depth: every entry point into this bypass (the UI button in
 * components/auth/LoginView.tsx, and this function itself) independently
 * re-checks isDevAutoAuthEnabled() and fails loudly (throws) rather than
 * silently no-op-ing, so a misconfigured/production environment can never
 * end up in the bypassed state.
 */
export const DEV_AUTO_AUTH_STORAGE_KEY = 'sensorpack.devAutoAuth';

export function activateDevAutoAuthSession(): void {
  if (!isDevAutoAuthEnabled()) {
    // Fail fast and loud (.claude/rules/coding-style.md: no silent fallback).
    throw new Error(
      'activateDevAutoAuthSession() may only run when isDevAutoAuthEnabled() is true. ' +
        'Refusing to activate the development auto-auth bypass outside of development.'
    );
  }

  window.localStorage.setItem(DEV_AUTO_AUTH_STORAGE_KEY, 'true');
}

export function isDevAutoAuthSessionActive(): boolean {
  if (!isDevAutoAuthEnabled()) {
    return false;
  }

  return window.localStorage.getItem(DEV_AUTO_AUTH_STORAGE_KEY) === 'true';
}

export function clearDevAutoAuthSession(): void {
  window.localStorage.removeItem(DEV_AUTO_AUTH_STORAGE_KEY);
}
