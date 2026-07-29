import { expect, test } from '@playwright/test';
import { interpolate, t } from './support/messages';

/**
 * F5 運用ツール(遠隔手動制御・自動ルール) — Issue #21.
 *
 * components/control/mockControlApi.ts is a pure in-memory mock (setTimeout
 * state machine, no network) — see WORK/2026-07-28-issue-21-operation-tools.md's
 * residual-gap note that the real `POST /devices/{deviceId}/commands`
 * endpoint is still pending. Every assertion below exercises the real
 * ConfirmDialog/DeviceControlCard component logic against that mock.
 *
 * Root CLAUDE.md and .claude/rules/coding-style.md prohibit native
 * `alert()`/`confirm()`/`prompt()`; this suite asserts that directly by
 * failing the test if the browser ever raises a native dialog, rather than
 * only checking that a *custom* dialog appears (which the existing Jest
 * suite already spies on via `window.confirm`).
 */
test.describe('運用ツール(遠隔制御)', () => {
  test.beforeEach(({ page }) => {
    page.on('dialog', (dialog) => {
      throw new Error(
        `Native ${dialog.type()}() dialog fired ("${dialog.message()}") — CLAUDE.md forbids alert()/confirm()/prompt(); ` +
          'this must be a custom in-app ConfirmDialog instead.'
      );
    });
  });

  test('オンライン機器のLEDをオンにする確認ダイアログ→送信で送信待ち・届いた・実行ずみと遷移する', async ({
    page,
  }) => {
    await page.goto('/ja/control');

    const onlineCard = page.getByRole('region', { name: 'Warehouse A - Entrance' });
    const ledLabel = t('ja', 'control.actuator.led');
    const toggleAriaLabel = interpolate(t('ja', 'control.actuatorToggleAriaLabel'), { actuator: ledLabel });
    const ledSwitch = onlineCard.getByRole('switch', { name: toggleAriaLabel });

    await expect(ledSwitch).toHaveAttribute('aria-checked', 'false');
    await ledSwitch.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(interpolate(t('ja', 'control.confirm.turnOnTitle'), { actuator: ledLabel }));
    await dialog.getByRole('button', { name: t('ja', 'control.confirm.confirmButton') }).click();

    await expect(ledSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(onlineCard.getByText(t('ja', 'control.commandStatus.pending'))).toBeVisible();
    // mockControlApi.ts's online lifecycle is pending -> delivered (400ms) ->
    // done (+400ms later). Verified (via console.debug tracing already
    // built into mockControlApi.ts) that both transitions really do fire in
    // a real browser, but the intermediate "delivered" state is not
    // reliably observable by polling: the two setTimeout callbacks land
    // close enough together that React can (correctly, and often) skip
    // straight from "pending" to "done" without ever painting the
    // in-between frame — asserting on it would make this test flaky against
    // real rendering, not against a real bug. Only the pending → done
    // endpoints are asserted; the full three-state sequence already has
    // deterministic coverage via Jest fake timers in
    // src/web/__tests__/control/control-view.test.tsx.
    await expect(onlineCard.getByText(t('ja', 'control.commandStatus.done'))).toBeVisible({ timeout: 8_000 });
  });

  test('確認ダイアログをキャンセルすると状態は変化しない', async ({ page }) => {
    await page.goto('/ja/control');

    const onlineCard = page.getByRole('region', { name: 'Warehouse A - Entrance' });
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

    const offlineCard = page.getByRole('region', { name: 'Home - Living Room' });
    await expect(offlineCard.getByText(t('ja', 'control.offlineWarning'))).toBeVisible();

    const ledLabel = t('ja', 'control.actuator.led');
    const toggleAriaLabel = interpolate(t('ja', 'control.actuatorToggleAriaLabel'), { actuator: ledLabel });
    await offlineCard.getByRole('switch', { name: toggleAriaLabel }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(t('ja', 'control.offlineWarning'));
    await dialog.getByRole('button', { name: t('ja', 'control.confirm.confirmButton') }).click();

    // The command is accepted (pending) even though the device is offline —
    // it only becomes "届きませんでした" after the real 10 minute TTL
    // (mockControlApi.ts's COMMAND_TTL_MS), which this suite intentionally
    // does not wait out in real time; that transition already has dedicated
    // coverage in src/web/__tests__/control/control-view.test.tsx via Jest
    // fake timers.
    await expect(offlineCard.getByText(t('ja', 'control.commandStatus.pending'))).toBeVisible();
  });
});
