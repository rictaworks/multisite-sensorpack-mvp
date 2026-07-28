import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import DeviceControlCard from '../../components/control/DeviceControlCard';
import type { ControlDevice } from '../../components/control/types';
import en from '../../locales/en.json';

const FIXED_NOW = Date.parse('2026-07-28T12:00:00.000Z');

function renderCard(device: ControlDevice, overrides: Partial<Record<string, jest.Mock>> = {}) {
  const onToggleConfirmed = overrides.onToggleConfirmed ?? jest.fn();
  const onAutomationToggle = overrides.onAutomationToggle ?? jest.fn();

  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DeviceControlCard
        device={device}
        now={FIXED_NOW}
        onToggleConfirmed={onToggleConfirmed}
        onAutomationToggle={onAutomationToggle}
      />
    </NextIntlClientProvider>
  );

  return { onToggleConfirmed, onAutomationToggle };
}

function baseDevice(overrides: Partial<ControlDevice> = {}): ControlDevice {
  return {
    id: 'd1',
    siteName: 'Warehouse A',
    name: 'Warehouse A - Entrance',
    status: 'online',
    ledOn: false,
    fanOn: false,
    automationRule: { fanOnTempAlert: true, ledOnAlert: true, manualOverrideUntil: null },
    commands: [],
    ...overrides,
  };
}

describe('DeviceControlCard', () => {
  it('renders LED and Fan switches in the Off state by default', () => {
    renderCard(baseDevice());

    const ledSwitch = screen.getByRole('switch', { name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led) });
    const fanSwitch = screen.getByRole('switch', { name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.fan) });

    expect(ledSwitch).toHaveAttribute('aria-checked', 'false');
    expect(fanSwitch).toHaveAttribute('aria-checked', 'false');
  });

  it('does NOT use the native confirm()/alert()/prompt() and instead opens a custom dialog when a toggle is clicked', () => {
    const nativeConfirm = jest.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('native confirm() must never be called (CLAUDE.md)');
    });
    const nativeAlert = jest.spyOn(window, 'alert').mockImplementation(() => {
      throw new Error('native alert() must never be called (CLAUDE.md)');
    });

    renderCard(baseDevice());

    const ledSwitch = screen.getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led),
    });
    fireEvent.click(ledSwitch);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByText(en.control.confirm.turnOnTitle.replace('{actuator}', en.control.actuator.led))
    ).toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(nativeAlert).not.toHaveBeenCalled();

    nativeConfirm.mockRestore();
    nativeAlert.mockRestore();
  });

  it('calls onToggleConfirmed only after the custom confirm dialog is accepted, not on cancel', () => {
    const { onToggleConfirmed } = renderCard(baseDevice());

    const ledSwitch = screen.getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.led),
    });
    fireEvent.click(ledSwitch);

    fireEvent.click(screen.getByRole('button', { name: en.control.confirm.cancelButton }));
    expect(onToggleConfirmed).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(ledSwitch);
    fireEvent.click(screen.getByRole('button', { name: en.control.confirm.confirmButton }));

    expect(onToggleConfirmed).toHaveBeenCalledTimes(1);
    expect(onToggleConfirmed).toHaveBeenCalledWith('d1', 'led', true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the offline warning banner, and includes it in the confirm dialog, when the device is offline', () => {
    renderCard(baseDevice({ status: 'offline' }));

    expect(screen.getByRole('status')).toHaveTextContent(en.control.offlineWarning);

    const fanSwitch = screen.getByRole('switch', {
      name: en.control.actuatorToggleAriaLabel.replace('{actuator}', en.control.actuator.fan),
    });
    fireEvent.click(fanSwitch);

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(en.control.offlineWarning)).toBeInTheDocument();
  });

  it('calls onAutomationToggle when an automation rule checkbox changes, without any confirm dialog', () => {
    const { onAutomationToggle } = renderCard(baseDevice());

    const fanRuleCheckbox = screen.getByRole('checkbox', { name: new RegExp(en.control.automation.fanOnTempAlert) });
    fireEvent.click(fanRuleCheckbox);

    expect(onAutomationToggle).toHaveBeenCalledWith('d1', 'fanOnTempAlert', false);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows the manual-override notice while a manual override window is active, and hides it once it has expired', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeviceControlCard
          device={baseDevice({
            automationRule: {
              fanOnTempAlert: true,
              ledOnAlert: true,
              manualOverrideUntil: new Date(FIXED_NOW + 15 * 60 * 1000).toISOString(),
            },
          })}
          now={FIXED_NOW}
          onToggleConfirmed={jest.fn()}
          onAutomationToggle={jest.fn()}
        />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText(en.control.automation.overrideNotice.replace('{minutes}', '15'))
    ).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <DeviceControlCard
          device={baseDevice({
            automationRule: {
              fanOnTempAlert: true,
              ledOnAlert: true,
              manualOverrideUntil: new Date(FIXED_NOW - 1000).toISOString(),
            },
          })}
          now={FIXED_NOW}
          onToggleConfirmed={jest.fn()}
          onAutomationToggle={jest.fn()}
        />
      </NextIntlClientProvider>
    );

    expect(
      screen.queryByText(en.control.automation.overrideNotice.replace('{minutes}', '15'))
    ).not.toBeInTheDocument();
  });

  it('renders the command history with a translated "not delivered" status for an expired command', () => {
    renderCard(
      baseDevice({
        commands: [
          {
            id: 'c1',
            deviceId: 'd1',
            commandType: 'FAN_ON',
            idempotencyKey: 'c1',
            origin: 'manual',
            status: 'expired',
            issuedAt: new Date().toISOString(),
            expiresAt: new Date().toISOString(),
          },
        ],
      })
    );

    expect(screen.getByText(en.control.commandStatus.expired)).toBeInTheDocument();
  });

  it('shows the empty-history message when no commands have been issued yet', () => {
    renderCard(baseDevice());
    expect(screen.getByText(en.control.history.empty)).toBeInTheDocument();
  });
});
