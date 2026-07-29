import 'server-only';

/**
 * Resolves the real Rails backend origin.
 *
 * This value is deliberately NOT prefixed with `NEXT_PUBLIC_`, so it never ends up
 * in the browser bundle (.claude/rules/deploy.md: "バックエンドのドメインは隠蔽する").
 * The `server-only` import makes an accidental client-side import fail the build
 * loudly rather than silently leaking the deploy platform's raw hostname.
 *
 * Shared by every server-side module that talks to Rails (the `/auth/session`
 * proxy in lib/auth/backendSession.ts and the `/api/v1/*` proxy in
 * lib/api/backendProxy.ts) so the resolution rule exists in exactly one place
 * (.claude/development-principles.md: DRY).
 */
export function getBackendApiBaseUrl(): string {
  const baseUrl = process.env.BACKEND_API_BASE_URL;
  if (!baseUrl) {
    // No fallback to a guessed default host: a wrong backend origin would fail in
    // confusing ways (or, worse, silently talk to something else) instead of
    // pointing at the actual misconfiguration
    // (.claude/rules/coding-style.md: フォールバック処理を書かない / Fail Fast).
    throw new Error(
      'BACKEND_API_BASE_URL is not set. Configure it via .env (development) or the ' +
        'deploy platform environment variables (production) before any backend ' +
        'call can be made — see .claude/rules/deploy.md.'
    );
  }
  return baseUrl;
}
