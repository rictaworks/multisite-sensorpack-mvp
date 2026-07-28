'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import DeviceControlCard from './DeviceControlCard';
import { dispatchCommand } from './mockControlApi';
import styles from './control.module.css';
import type { ActuatorKind, Command, CommandTypeCode, ControlDevice } from './types';

/**
 * Manual override window: a manual command suppresses automation for the
 * same actuator for 30 minutes (openapi.yaml AutomationRule.manualOverrideUntil).
 */
const MANUAL_OVERRIDE_MS = 30 * 60 * 1000;

/**
 * Seed devices for this screen. The real device/site list comes from the
 * backend (F1/F4); since Issue #21 explicitly scopes the API as mock/stub,
 * this is representative sample data only, shaped like `ControlDevice`.
 */
function createInitialDevices(): ControlDevice[] {
  return [
    {
      id: 'd1',
      siteName: 'Warehouse A',
      name: 'Warehouse A - Entrance',
      status: 'online',
      ledOn: false,
      fanOn: false,
      automationRule: { fanOnTempAlert: true, ledOnAlert: true, manualOverrideUntil: null },
      commands: [],
    },
    {
      id: 'd2',
      siteName: 'Home',
      name: 'Home - Living Room',
      status: 'offline',
      ledOn: false,
      fanOn: false,
      automationRule: { fanOnTempAlert: false, ledOnAlert: true, manualOverrideUntil: null },
      commands: [],
    },
  ];
}

function commandTypeFor(kind: ActuatorKind, nextOn: boolean): CommandTypeCode {
  if (kind === 'led') {
    return nextOn ? 'LED_ON' : 'LED_OFF';
  }
  return nextOn ? 'FAN_ON' : 'FAN_OFF';
}

const MAX_HISTORY_ROWS = 6;
const CLOCK_TICK_MS = 1000;

export default function ControlView() {
  const t = useTranslations('control');
  const [devices, setDevices] = useState<ControlDevice[]>(createInitialDevices);
  // `now` is sampled inside this effect (not during render) so the component
  // stays pure per the React `react-hooks/purity` rule, and is threaded down
  // as a prop wherever a manual-override countdown needs "the current time".
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const applyCommandUpdate = useCallback((deviceId: string, updated: Command) => {
    setDevices((current) =>
      current.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              commands: device.commands.map((command) =>
                command.idempotencyKey === updated.idempotencyKey ? updated : command
              ),
            }
          : device
      )
    );
  }, []);

  const handleToggleConfirmed = useCallback(
    (deviceId: string, kind: ActuatorKind, nextOn: boolean) => {
      // Reading the clock and dispatching the (side-effecting) mock command
      // here, in the event handler, rather than inside the setDevices
      // updater below: state updater functions are re-invoked by React
      // during rendering and must stay pure, so they must not call impure
      // functions (Date.now()) or trigger side effects (scheduling timers).
      const target = devices.find((device) => device.id === deviceId);
      if (!target) {
        throw new Error(`handleToggleConfirmed: unknown deviceId "${deviceId}"`);
      }

      const commandType = commandTypeFor(kind, nextOn);
      const command = dispatchCommand(deviceId, commandType, target.status, (updated) =>
        applyCommandUpdate(deviceId, updated)
      );
      const manualOverrideUntil = new Date(Date.now() + MANUAL_OVERRIDE_MS).toISOString();

      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? {
                ...device,
                ledOn: kind === 'led' ? nextOn : device.ledOn,
                fanOn: kind === 'fan' ? nextOn : device.fanOn,
                automationRule: { ...device.automationRule, manualOverrideUntil },
                commands: [command, ...device.commands].slice(0, MAX_HISTORY_ROWS),
              }
            : device
        )
      );
    },
    [devices, applyCommandUpdate]
  );

  const handleAutomationToggle = useCallback(
    (deviceId: string, key: 'fanOnTempAlert' | 'ledOnAlert', value: boolean) => {
      setDevices((current) =>
        current.map((device) =>
          device.id === deviceId
            ? { ...device, automationRule: { ...device.automationRule, [key]: value } }
            : device
        )
      );
    },
    []
  );

  return (
    <main className={styles.page}>
      <div className={styles.eyebrow}>{t('eyebrow')}</div>
      <h1 className={styles.title}>{t('title')}</h1>
      <div className={styles.titleRule} />

      {devices.length === 0 ? (
        <p className={styles.noDevices}>{t('noDevices')}</p>
      ) : (
        <div className={styles.deviceList}>
          {devices.map((device) => (
            <DeviceControlCard
              key={device.id}
              device={device}
              now={now}
              onToggleConfirmed={handleToggleConfirmed}
              onAutomationToggle={handleAutomationToggle}
            />
          ))}
        </div>
      )}
    </main>
  );
}
