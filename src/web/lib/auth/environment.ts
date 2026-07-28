/**
 * Single source of truth for runtime environment detection used by the auth
 * feature (.claude/rules/environment.md).
 *
 * Rules enforced here (do not duplicate this logic elsewhere):
 *   - `APP_ENV` is the canonical variable when present; `NODE_ENV` (which
 *     Next.js itself sets to "production" for `next build`/`next start`,
 *     "development" for `next dev` and "test" under Jest) is used as a
 *     fallback so behaviour is still correct even if `APP_ENV` was never
 *     configured on the deploy platform.
 *   - Any value that is not exactly "development", "test" or "production"
 *     (missing, misspelled, unexpected) fails closed to "production". This
 *     guarantees dev-only shortcuts (e.g. the auto-auth bypass) can never be
 *     reached unless the environment is unambiguously "development".
 */

export type AppEnvironment = 'development' | 'test' | 'production';

const KNOWN_ENVIRONMENTS: ReadonlySet<string> = new Set<AppEnvironment>([
  'development',
  'test',
  'production',
]);

function isKnownEnvironment(value: string | undefined): value is AppEnvironment {
  return value !== undefined && KNOWN_ENVIRONMENTS.has(value);
}

export function getAppEnvironment(): AppEnvironment {
  const candidate = process.env.APP_ENV ?? process.env.NODE_ENV;

  if (isKnownEnvironment(candidate)) {
    return candidate;
  }

  // Fail closed: an unset or unrecognized environment must never be treated
  // as anything other than production.
  return 'production';
}

export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === 'production';
}

/**
 * Whether the development-only authentication bypass is allowed to be
 * offered at all. This must be the single gate every dev-auto-auth code path
 * checks; see lib/auth/devAutoAuth.ts and __tests__/auth-environment.test.ts
 * for the fail-closed guarantee this relies on.
 */
export function isDevAutoAuthEnabled(): boolean {
  return getAppEnvironment() === 'development';
}
