import type { components } from '../../../shared/contracts/types/api';

/**
 * Alert-related types re-exported from the shared OpenAPI contract
 * (src/shared/contracts/openapi.yaml, Issue #5) rather than redefined here,
 * per src/shared/contracts/CONTRACT.md ("APIの形状をコンポーネント側で再定義しない").
 */
export type Alert = components['schemas']['Alert'];
export type AlertStatus = components['schemas']['AlertStatus'];
export type AlertSeverity = components['schemas']['AlertSeverity'];
export type AlertTypeCode = components['schemas']['AlertTypeCode'];

/**
 * Thrown when a caller tries to acknowledge an alert that does not exist, or
 * one that is not currently 'open'. Per requirements.md F8.2, users may only
 * acknowledge open alerts; 'closed' is reachable only through automatic
 * resolution (threshold recovery / device reconnect), never a manual action.
 */
export class AlertNotAcknowledgeableError extends Error {
  constructor(alertId: number, reason: 'not_found' | 'not_open') {
    super(
      reason === 'not_found'
        ? `Alert ${alertId} was not found.`
        : `Alert ${alertId} is not open and cannot be acknowledged.`
    );
    this.name = 'AlertNotAcknowledgeableError';
  }
}

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/**
 * Seed data standing in for `GET /alerts` (src/shared/contracts/openapi.yaml)
 * until the Rails API (Issue #1) exposes the real endpoint (Issue #20 edit
 * scope explicitly allows the API to be mocked/stubbed). Mirrors the 2-device
 * minimal test fixture described in requirements.md 1.8 (最小構成) and includes
 * one alert per status so the open/acknowledged/closed tabs are all populated
 * without requiring manual interaction first.
 */
function seedAlerts(): Alert[] {
  return [
    {
      id: 1,
      deviceId: 1,
      alertType: 'upper_breach',
      severity: 'warning',
      status: 'open',
      openedAt: minutesAgoIso(12),
    },
    {
      id: 2,
      deviceId: 2,
      alertType: 'offline',
      severity: 'critical',
      status: 'open',
      openedAt: minutesAgoIso(47),
    },
    {
      id: 3,
      deviceId: 2,
      alertType: 'upper_breach',
      severity: 'warning',
      status: 'acknowledged',
      openedAt: minutesAgoIso(90),
      acknowledgedAt: minutesAgoIso(30),
    },
    {
      id: 4,
      deviceId: 1,
      alertType: 'lower_breach',
      severity: 'info',
      status: 'closed',
      openedAt: minutesAgoIso(320),
      closedAt: minutesAgoIso(60),
    },
  ];
}

/**
 * In-memory stand-in for the alerts API. All mutable state lives inside the
 * instance (never at module scope), per .claude/rules/coding-style.md's ban
 * on global variables — each caller (and each test) gets its own isolated
 * store by constructing a fresh instance via createMockAlertsRepository().
 *
 * TODO(follow-up issue, once Issue #1's Rails API is reachable from Next.js):
 * replace list()/acknowledge() bodies with real `fetch('/alerts', ...)` /
 * `fetch('/alerts/{id}/ack', { method: 'POST' })` calls typed against
 * src/shared/contracts/types/api.ts's `paths` export. The public method
 * signatures below are already shaped to match that future swap.
 */
export class MockAlertsRepository {
  private alerts: Alert[];

  constructor(initialAlerts: Alert[] = seedAlerts()) {
    this.alerts = initialAlerts.map((alert) => ({ ...alert }));
  }

  async list(): Promise<Alert[]> {
    console.debug('[alertsRepository] list() called', { count: this.alerts.length });
    return Promise.resolve(this.alerts.map((alert) => ({ ...alert })));
  }

  async acknowledge(alertId: number): Promise<Alert> {
    console.debug('[alertsRepository] acknowledge() called', { alertId });
    const index = this.alerts.findIndex((alert) => alert.id === alertId);
    if (index === -1) {
      console.error('[alertsRepository] acknowledge() failed: alert not found', { alertId });
      throw new AlertNotAcknowledgeableError(alertId, 'not_found');
    }

    const target = this.alerts[index];
    if (target.status !== 'open') {
      console.error('[alertsRepository] acknowledge() failed: alert is not open', {
        alertId,
        status: target.status,
      });
      throw new AlertNotAcknowledgeableError(alertId, 'not_open');
    }

    const acknowledged: Alert = {
      ...target,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    };
    this.alerts[index] = acknowledged;
    console.debug('[alertsRepository] acknowledge() succeeded', { alertId });
    return { ...acknowledged };
  }
}

export function createMockAlertsRepository(): MockAlertsRepository {
  return new MockAlertsRepository();
}
