'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ConfirmDialog from './ConfirmDialog';
import styles from './control.module.css';
import type { ActuatorKind, ControlDevice } from './types';

const ACTUATOR_KINDS: ActuatorKind[] = ['led', 'fan'];

type PendingToggle = {
  kind: ActuatorKind;
  nextOn: boolean;
};

type DeviceControlCardProps = {
  device: ControlDevice;
  /**
   * Current wall-clock time in ms, ticked by the parent (`ControlView`) and
   * passed down as a prop. Components must stay pure during render (no direct
   * `Date.now()` calls in the render body — see the React `react-hooks/purity`
   * rule), so "now" is sampled in an effect at the call site and threaded
   * through props instead, mirroring the single ticking clock the reference
   * mock (`app-ui/SensorPack Dashboard.dc.html`) keeps in top-level state.
   * `null` until the first tick has landed.
   */
  now: number | null;
  onToggleRequested?: (deviceId: string, kind: ActuatorKind, nextOn: boolean) => void;
  onToggleConfirmed: (deviceId: string, kind: ActuatorKind, nextOn: boolean) => void;
  onAutomationToggle: (
    deviceId: string,
    key: 'fanOnTempAlert' | 'ledOnAlert',
    value: boolean
  ) => void;
};

function actuatorIconClass(kind: ActuatorKind): string {
  return kind === 'led' ? 'fa-solid fa-lightbulb' : 'fa-solid fa-fan';
}

export default function DeviceControlCard({
  device,
  now,
  onToggleRequested,
  onToggleConfirmed,
  onAutomationToggle,
}: DeviceControlCardProps) {
  const t = useTranslations('control');
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);

  const isOffline = device.status === 'offline';
  const overrideUntilMs = device.automationRule.manualOverrideUntil
    ? new Date(device.automationRule.manualOverrideUntil).getTime()
    : 0;
  const overrideActive = now !== null && overrideUntilMs > now;
  const overrideMinutesLeft = overrideActive && now !== null
    ? Math.max(1, Math.ceil((overrideUntilMs - now) / 60000))
    : 0;

  const actuatorLabel = (kind: ActuatorKind): string => t(`actuator.${kind}`);
  const stateLabel = (on: boolean): string => (on ? t('actuatorStateOn') : t('actuatorStateOff'));

  const requestToggle = (kind: ActuatorKind) => {
    const currentOn = kind === 'led' ? device.ledOn : device.fanOn;
    const nextOn = !currentOn;
    onToggleRequested?.(device.id, kind, nextOn);
    setPendingToggle({ kind, nextOn });
  };

  const confirmToggle = () => {
    if (!pendingToggle) {
      throw new Error('confirmToggle called without a pending toggle');
    }
    onToggleConfirmed(device.id, pendingToggle.kind, pendingToggle.nextOn);
    setPendingToggle(null);
  };

  const cancelToggle = () => setPendingToggle(null);

  return (
    <section className={styles.deviceCard} aria-label={device.name}>
      <header className={styles.deviceHeader}>
        <div>
          <p className={styles.deviceSite}>{device.siteName}</p>
          <h2 className={styles.deviceName}>{device.name}</h2>
        </div>
        <span
          className={`${styles.deviceStatus} ${
            device.status === 'online'
              ? styles.deviceStatusOnline
              : device.status === 'offline'
                ? styles.deviceStatusOffline
                : styles.deviceStatusProvisioning
          }`}
        >
          {t(`deviceStatus.${device.status}`)}
        </span>
      </header>

      {isOffline ? (
        <p className={styles.offlineWarning} role="status">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>{t('offlineWarning')}</span>
        </p>
      ) : null}

      <div className={styles.actuatorList}>
        {ACTUATOR_KINDS.map((kind) => {
          const on = kind === 'led' ? device.ledOn : device.fanOn;
          return (
            <div className={styles.actuatorRow} key={kind}>
              <i className={`${actuatorIconClass(kind)} ${styles.actuatorIcon}`} aria-hidden="true" />
              <div className={styles.actuatorInfo}>
                <p className={styles.actuatorName}>{actuatorLabel(kind)}</p>
                <p className={styles.actuatorState}>{stateLabel(on)}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t('actuatorToggleAriaLabel', { actuator: actuatorLabel(kind) })}
                className={`${styles.toggleSwitch} ${on ? styles.toggleSwitchOn : ''}`}
                onClick={() => requestToggle(kind)}
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          );
        })}
      </div>

      <div className={styles.automation}>
        <h3 className={styles.automationTitle}>{t('automation.title')}</h3>
        <label className={styles.automationRule}>
          <input
            type="checkbox"
            checked={device.automationRule.fanOnTempAlert}
            onChange={(event) =>
              onAutomationToggle(device.id, 'fanOnTempAlert', event.target.checked)
            }
          />
          <span>
            <span className={styles.automationRuleLabel}>{t('automation.fanOnTempAlert')}</span>
            <span className={styles.automationRuleDesc}>{t('automation.fanOnTempAlertDesc')}</span>
          </span>
        </label>
        <label className={styles.automationRule}>
          <input
            type="checkbox"
            checked={device.automationRule.ledOnAlert}
            onChange={(event) => onAutomationToggle(device.id, 'ledOnAlert', event.target.checked)}
          />
          <span>
            <span className={styles.automationRuleLabel}>{t('automation.ledOnAlert')}</span>
            <span className={styles.automationRuleDesc}>{t('automation.ledOnAlertDesc')}</span>
          </span>
        </label>
        {overrideActive ? (
          <p className={styles.overrideNotice}>
            {t('automation.overrideNotice', { minutes: overrideMinutesLeft })}
          </p>
        ) : null}
      </div>

      <div className={styles.history}>
        <h3 className={styles.historyTitle}>{t('history.title')}</h3>
        {device.commands.length === 0 ? (
          <p className={styles.historyEmpty}>{t('history.empty')}</p>
        ) : (
          <ul className={styles.historyList}>
            {device.commands.map((command) => {
              const kind: ActuatorKind = command.commandType.startsWith('LED') ? 'led' : 'fan';
              const on = command.commandType.endsWith('_ON');
              const statusClass =
                command.status === 'pending'
                  ? styles.historyStatusPending
                  : command.status === 'delivered'
                    ? styles.historyStatusDelivered
                    : command.status === 'done'
                      ? styles.historyStatusDone
                      : styles.historyStatusExpired;
              return (
                <li key={command.idempotencyKey} className={styles.historyRow}>
                  <span style={{ flex: 1 }}>
                    {t('history.commandLabel', {
                      actuator: actuatorLabel(kind),
                      state: stateLabel(on),
                    })}
                  </span>
                  <span className={`${styles.historyStatus} ${statusClass}`}>
                    {t(`commandStatus.${command.status}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingToggle ? (
        <ConfirmDialog
          titleId={`control-confirm-${device.id}-${pendingToggle.kind}`}
          title={t(pendingToggle.nextOn ? 'confirm.turnOnTitle' : 'confirm.turnOffTitle', {
            actuator: actuatorLabel(pendingToggle.kind),
          })}
          description={isOffline ? t('offlineWarning') : t('confirm.body')}
          confirmLabel={t('confirm.confirmButton')}
          cancelLabel={t('confirm.cancelButton')}
          onConfirm={confirmToggle}
          onCancel={cancelToggle}
        />
      ) : null}
    </section>
  );
}
