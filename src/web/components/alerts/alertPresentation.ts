import type { Alert, AlertTypeCode } from './alertsRepository';

/**
 * Pure, presentation-only mappings for the alerts screen. These are plain
 * lookup tables (data, not control-flow logic), consistent with the existing
 * convention in i18n/config.ts. Colors are taken directly from
 * app-ui/SensorPack Dashboard.dc.html (reference-only design mock) to keep
 * visual parity with the approved design.
 */

export type Severity = Alert['severity'];
export type Status = Alert['status'];

export const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#6b82a0',
  warning: '#f0a020',
  critical: '#e5484d',
};

export const STATUS_COLORS: Record<Status, string> = {
  open: '#e5484d',
  acknowledged: '#f0a020',
  closed: '#1e8e3e',
};

/**
 * requirements.md 1.8 fixes the MVP test fixture at exactly 2 devices, so a
 * static id -> locale-key map is sufficient for this stub. Once device
 * records are fetched from the real API (Issue #1), this should be replaced
 * by the device's own name field instead of a translation key.
 */
const DEVICE_LABEL_KEYS: Record<number, string> = {
  1: 'device1',
  2: 'device2',
};

const ALERT_TYPE_MESSAGE_KEYS: Record<AlertTypeCode, string> = {
  upper_breach: 'upperBreach',
  lower_breach: 'lowerBreach',
  offline: 'offline',
};

export function getDeviceLabelKey(deviceId: number): string {
  const key = DEVICE_LABEL_KEYS[deviceId];
  if (!key) {
    throw new Error(`No stub device label configured for deviceId ${deviceId}`);
  }
  return key;
}

export function getAlertMessageKey(alertType: AlertTypeCode): string {
  return ALERT_TYPE_MESSAGE_KEYS[alertType];
}
