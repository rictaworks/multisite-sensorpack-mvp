import type { Alert, AlertTypeCode } from './alertsApi';

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

const ALERT_TYPE_MESSAGE_KEYS: Record<AlertTypeCode, string> = {
  upper_breach: 'upperBreach',
  lower_breach: 'lowerBreach',
  offline: 'offline',
};

export function getAlertMessageKey(alertType: AlertTypeCode): string {
  return ALERT_TYPE_MESSAGE_KEYS[alertType];
}
