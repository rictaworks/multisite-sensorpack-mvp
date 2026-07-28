import { getAppEnvironment, isDevAutoAuthEnabled } from '../lib/auth/environment';

/**
 * .claude/rules/environment.md:
 *   - Environment detection must have a single source of truth (no scattered
 *     ad-hoc checks).
 *   - When the environment cannot be determined, it MUST fail closed and be
 *     treated as production (dev-only shortcuts must never leak to prod).
 */
describe('auth environment detection (.claude/rules/environment.md)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('reports development when APP_ENV=development', () => {
    process.env.APP_ENV = 'development';
    expect(getAppEnvironment()).toBe('development');
  });

  it('reports test when APP_ENV=test', () => {
    process.env.APP_ENV = 'test';
    expect(getAppEnvironment()).toBe('test');
  });

  it('reports production when APP_ENV=production', () => {
    process.env.APP_ENV = 'production';
    expect(getAppEnvironment()).toBe('production');
  });

  it('falls back to NODE_ENV when APP_ENV is not set', () => {
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'development';
    expect(getAppEnvironment()).toBe('development');
  });

  it('prefers APP_ENV over NODE_ENV when both are set (single source of truth)', () => {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'development';
    expect(getAppEnvironment()).toBe('production');
  });

  it('fails closed to production when both variables are unset', () => {
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;
    expect(getAppEnvironment()).toBe('production');
  });

  it('fails closed to production when the value is unrecognized/garbled', () => {
    process.env.APP_ENV = 'staging-typo';
    expect(getAppEnvironment()).toBe('production');
  });

  describe('isDevAutoAuthEnabled', () => {
    it('is true only in development', () => {
      process.env.APP_ENV = 'development';
      expect(isDevAutoAuthEnabled()).toBe(true);
    });

    it('is false in test', () => {
      process.env.APP_ENV = 'test';
      expect(isDevAutoAuthEnabled()).toBe(false);
    });

    it('is false in production (must never be reachable in prod)', () => {
      process.env.APP_ENV = 'production';
      expect(isDevAutoAuthEnabled()).toBe(false);
    });

    it('is false (fails closed) when the environment is unknown', () => {
      delete process.env.APP_ENV;
      delete process.env.NODE_ENV;
      expect(isDevAutoAuthEnabled()).toBe(false);
    });
  });
});
