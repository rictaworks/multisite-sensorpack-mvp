import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';
import { CONTROL_DEVICE_IDS, stubControlApi } from './support/controlApiStub';

/**
 * F5 運用ツール(遠隔手動制御・自動ルール) — Issue #21.
 *
 * この画面は実API(`GET /devices`・`POST /devices/{id}/commands`・
 * `PUT /devices/{id}/automation-rule` ほか)へ結線しており、かつての
 * mockControlApi.ts(setTimeoutで状態遷移を擬似再現するモック)は撤去した。
 * このスイートはRailsの起動に依存しない方針のため、応答は support/controlApiStub.ts が
 * ブラウザのネットワーク層で差し替える(アプリ側のフォールバックではない)。
 *
 * Root CLAUDE.md and .claude/rules/coding-style.md prohibit native
 * `alert()`/`confirm()`/`prompt()`; this suite asserts that directly by
 * failing the test if the browser ever raises a native dialog, rather than
 * only checking that a *custom* dialog appears (which the existing Jest
 * suite already spies on via `window.confirm`).
 */
test.describe('運用ツール(遠隔制御)', () => {
  test.beforeEach(async ({ page }) => {
    await stubControlApi(page);
    page.on('dialog', (dialog) => {
      throw new Error(
        `Native ${dialog.type()}() dialog fired ("${dialog.message()}") — CLAUDE.md forbids alert()/confirm()/prompt(); ` +
          'this must be a custom in-app ConfirmDialog instead.'
      );
    });
  });

  test('オンライン機器のLEDをオンにする確認ダイアログ→送信でコマンドが発行され状態に反映される', async ({
    page,
  }) => {
    await page.goto('/ja/control');

    const onlineCard = page.getByRole('region', {
      name: interpolate(t('ja', 'dashboard.overview.deviceLabel'), { id: CONTROL_DEVICE_IDS.online }),
    });
    const ledLabel = t('ja', 'control.actuator.led');
    const toggleAriaLabel = interpolate(t('ja', 'control.actuatorToggleAriaLabel'), { actuator: ledLabel });
    const ledSwitch = onlineCard.getByRole('switch', { name: toggleAriaLabel });

    await expect(ledSwitch).toHaveAttribute('aria-checked', 'false');
    await ledSwitch.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(interpolate(t('ja', 'control.confirm.turnOnTitle'), { actuator: ledLabel }));
    await dialog.getByRole('button', { name: t('ja', 'control.confirm.confirmButton') }).click();

    // 発行後は取得し直した結果が反映される(画面側で先回りして状態を作らない)。
    await expect(ledSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(onlineCard.getByText(t('ja', 'control.commandStatus.done'))).toBeVisible({ timeout: 10_000 });
  });

  test('確認ダイアログをキャンセルすると状態は変化しない', async ({ page }) => {
    await page.goto('/ja/control');

    const onlineCard = page.getByRole('region', {
      name: interpolate(t('ja', 'dashboard.overview.deviceLabel'), { id: CONTROL_DEVICE_IDS.online }),
    });
    const fanLabel = t('ja', 'control.actuator.fan');
    const toggleAriaLabel = interpolate(t('ja', 'control.actuatorToggleAriaLabel'), { actuator: fanLabel });
    const fanSwitch = onlineCard.getByRole('switch', { name: toggleAriaLabel });

    await fanSwitch.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.getByRole('button', { name: t('ja', 'control.confirm.cancelButton') }).click();

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(fanSwitch).toHaveAttribute('aria-checked', 'false');
  });

  test('オフライン機器を操作すると確認ダイアログにオフライン警告が表示される', async ({ page }) => {
    await page.goto('/ja/control');

    const offlineCard = page.getByRole('region', {
      name: interpolate(t('ja', 'dashboard.overview.deviceLabel'), { id: CONTROL_DEVICE_IDS.offline }),
    });
    await expect(offlineCard.getByText(t('ja', 'control.offlineWarning'))).toBeVisible();

    const ledLabel = t('ja', 'control.actuator.led');
    const toggleAriaLabel = interpolate(t('ja', 'control.actuatorToggleAriaLabel'), { actuator: ledLabel });
    await offlineCard.getByRole('switch', { name: toggleAriaLabel }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(t('ja', 'control.offlineWarning'));
    await dialog.getByRole('button', { name: t('ja', 'control.confirm.confirmButton') }).click();

    // オフラインでもコマンドの発行自体は受け付けられる(復帰後TTL内なら実行される)。
    // 実際に「届きませんでした」になるのは10分のTTL経過後で、このスイートでは待たない。
    await expect(offlineCard.getByText(t('ja', 'control.history.empty'))).toHaveCount(0, { timeout: 10_000 });
  });
});
