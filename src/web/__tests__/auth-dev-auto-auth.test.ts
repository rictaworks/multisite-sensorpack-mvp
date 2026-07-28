import { activateDevAutoAuthSession, DEV_AUTO_AUTH_STORAGE_KEY } from '../lib/auth/devAutoAuth';

/**
 * .claude/rules/environment.md: the dev-only auto-auth bypass must be
 * fail-closed. This is defense-in-depth on top of __tests__/auth-environment.test.ts:
 * even if a caller somehow reaches this function (e.g. a future refactor
 * forgets to gate the UI on isDevAutoAuthEnabled()), the function itself
 * must refuse to run outside development.
 */
describe('activateDevAutoAuthSession (defense in depth, .claude/rules/environment.md)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    window.localStorage.clear();
  });

  it('activates the bypass session in development', () => {
    process.env.APP_ENV = 'development';

    activateDevAutoAuthSession();

    expect(window.localStorage.getItem(DEV_AUTO_AUTH_STORAGE_KEY)).toBe('true');
  });

  it('throws and never activates anything when APP_ENV=production', () => {
    process.env.APP_ENV = 'production';

    expect(() => activateDevAutoAuthSession()).toThrow();
    expect(window.localStorage.getItem(DEV_AUTO_AUTH_STORAGE_KEY)).toBeNull();
  });

  it('throws and never activates anything when APP_ENV=test', () => {
    process.env.APP_ENV = 'test';

    expect(() => activateDevAutoAuthSession()).toThrow();
    expect(window.localStorage.getItem(DEV_AUTO_AUTH_STORAGE_KEY)).toBeNull();
  });

  it('throws (fails closed) when the environment is unknown/unset', () => {
    delete process.env.APP_ENV;
    delete process.env.NODE_ENV;

    expect(() => activateDevAutoAuthSession()).toThrow();
    expect(window.localStorage.getItem(DEV_AUTO_AUTH_STORAGE_KEY)).toBeNull();
  });
});
