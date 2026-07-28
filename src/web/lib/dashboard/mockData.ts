import type { components } from '@contracts/api';

/**
 * Contract-shaped stub data for the multi-site dashboard (Issue #18 / F6).
 *
 * The real Rails API integration is explicitly out of scope for this issue
 * (see Issue #18 body: "実際のRails API連携は後続issueの範囲"). To keep this
 * a drop-in replacement later, every function here mirrors the request/response
 * shape of the corresponding endpoint in src/shared/contracts/openapi.yaml
 * (single source of truth — see CONTRACT.md) instead of inventing an ad hoc
 * shape.
 *
 * Known contract gap (documented, not silently worked around — see
 * .claude/rules/coding-style.md "フォールバック禁止"): the `Device` schema
 * has no display name field. Device labels are derived from the device id
 * (`#{id}`) by the presentation layer; a future issue should extend the
 * contract (and this stub) once device naming is modeled.
 *
 * All data is deterministic (no Math.random / no wall-clock in the numbers
 * themselves). The one wall-clock dependency — "now", used as the anchor for
 * lastSeenAt/timestamps — is memoized behind `stubNow()` below (a closure,
 * not a module-level `let`, per .claude/rules/coding-style.md's ban on global
 * variables) so repeated calls within the same process return byte-identical
 * output instead of drifting by a few milliseconds.
 */

type Site = components['schemas']['Site'];
type Device = components['schemas']['Device'];
type DeviceDetail = components['schemas']['DeviceDetail'];
type Threshold = components['schemas']['Threshold'];
type Command = components['schemas']['Command'];
type Alert = components['schemas']['Alert'];
type TelemetrySeriesPoint = components['schemas']['TelemetrySeriesPoint'];
type SensorTypeCode = components['schemas']['SensorTypeCode'];

export interface TelemetrySeriesResponse {
  points: TelemetrySeriesPoint[];
  thresholds: Threshold[];
}

const MINUTE_MS = 60 * 1000;

function createStubClock(): () => number {
  let anchor: number | null = null;
  return function stubNow(): number {
    if (anchor === null) {
      anchor = Date.now();
    }
    return anchor;
  };
}

const stubNow = createStubClock();

function isoMinutesAgo(now: number, minutes: number): string {
  return new Date(now - minutes * MINUTE_MS).toISOString();
}

interface SiteFixture {
  id: number;
  name: string;
  createdAtDaysAgo: number;
}

interface DeviceFixture {
  id: number;
  siteId: number;
  status: components['schemas']['DeviceStatus'];
  expectedIntervalSec: number;
  lastSeenMinutesAgo: number | null;
  createdAtDaysAgo: number;
  thresholds: Threshold[];
  /** Deterministic seed driving the synthetic temperature/humidity waveform. */
  seed: number;
  /** Minutes-ago offset (within the 24h window) around which a temperature spike is injected. */
  spikeMinutesAgo: number | null;
  /** Constant offsets applied to the base waveform, so devices read visibly differently. */
  tempOffsetC: number;
  humidityOffsetPct: number;
}

const SITE_FIXTURES: SiteFixture[] = [
  { id: 1, name: '倉庫A', createdAtDaysAgo: 40 },
  { id: 2, name: '実家', createdAtDaysAgo: 25 },
];

const DEVICE_FIXTURES: DeviceFixture[] = [
  {
    id: 1,
    siteId: 1,
    status: 'online',
    expectedIntervalSec: 60,
    lastSeenMinutesAgo: 0.5,
    createdAtDaysAgo: 39,
    seed: 7,
    spikeMinutesAgo: 260,
    tempOffsetC: 0,
    humidityOffsetPct: 0,
    thresholds: [
      { sensorType: 'temperature', direction: 'upper', triggerValue: 28, deadband: 1.0, breachState: 'BREACHED' },
      { sensorType: 'temperature', direction: 'lower', triggerValue: 5, deadband: 1.0, breachState: 'NORMAL' },
      { sensorType: 'humidity', direction: 'upper', triggerValue: 75, deadband: 3, breachState: 'NORMAL' },
      { sensorType: 'humidity', direction: 'lower', triggerValue: 25, deadband: 3, breachState: 'NORMAL' },
    ],
  },
  {
    id: 2,
    siteId: 2,
    status: 'offline',
    expectedIntervalSec: 60,
    lastSeenMinutesAgo: 47,
    createdAtDaysAgo: 20,
    seed: 23,
    spikeMinutesAgo: null,
    tempOffsetC: -3.2,
    humidityOffsetPct: 6,
    thresholds: [
      { sensorType: 'temperature', direction: 'upper', triggerValue: 30, deadband: 1.0, breachState: 'NORMAL' },
      { sensorType: 'temperature', direction: 'lower', triggerValue: 2, deadband: 1.0, breachState: 'NORMAL' },
      { sensorType: 'humidity', direction: 'upper', triggerValue: 80, deadband: 3, breachState: 'NORMAL' },
      { sensorType: 'humidity', direction: 'lower', triggerValue: 20, deadband: 3, breachState: 'NORMAL' },
    ],
  },
  {
    id: 3,
    siteId: 2,
    status: 'provisioning',
    expectedIntervalSec: 60,
    lastSeenMinutesAgo: null,
    createdAtDaysAgo: 1,
    seed: 41,
    spikeMinutesAgo: null,
    tempOffsetC: 1.1,
    humidityOffsetPct: -2,
    thresholds: [
      { sensorType: 'temperature', direction: 'upper', triggerValue: 29, deadband: 1.0, breachState: 'NORMAL' },
      { sensorType: 'temperature', direction: 'lower', triggerValue: 4, deadband: 1.0, breachState: 'NORMAL' },
    ],
  },
];

const COMMAND_FIXTURES: Command[] = [
  {
    id: 1,
    deviceId: 1,
    commandType: 'FAN_ON',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    origin: 'auto',
    status: 'done',
    issuedAt: isoMinutesAgo(stubNow(), 12),
    expiresAt: isoMinutesAgo(stubNow(), 2),
  },
  {
    id: 2,
    deviceId: 1,
    commandType: 'LED_ON',
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    origin: 'manual',
    status: 'delivered',
    issuedAt: isoMinutesAgo(stubNow(), 30),
    expiresAt: isoMinutesAgo(stubNow(), 20),
  },
  {
    id: 3,
    deviceId: 2,
    commandType: 'FAN_OFF',
    idempotencyKey: '33333333-3333-4333-8333-333333333333',
    origin: 'manual',
    status: 'expired',
    issuedAt: isoMinutesAgo(stubNow(), 90),
    expiresAt: isoMinutesAgo(stubNow(), 80),
  },
];

const ALERT_FIXTURES: Alert[] = [
  {
    id: 1,
    deviceId: 1,
    alertType: 'upper_breach',
    severity: 'warning',
    status: 'open',
    openedAt: isoMinutesAgo(stubNow(), 12),
  },
  {
    id: 2,
    deviceId: 2,
    alertType: 'offline',
    severity: 'critical',
    status: 'open',
    openedAt: isoMinutesAgo(stubNow(), 47),
  },
  {
    id: 3,
    deviceId: 1,
    alertType: 'lower_breach',
    severity: 'info',
    status: 'closed',
    openedAt: isoMinutesAgo(stubNow(), 320),
    acknowledgedAt: isoMinutesAgo(stubNow(), 300),
    closedAt: isoMinutesAgo(stubNow(), 290),
  },
];

function deviceFixtureById(deviceId: number): DeviceFixture | undefined {
  return DEVICE_FIXTURES.find((fixture) => fixture.id === deviceId);
}

function toDevice(fixture: DeviceFixture): Device {
  return {
    id: fixture.id,
    siteId: fixture.siteId,
    status: fixture.status,
    expectedIntervalSec: fixture.expectedIntervalSec,
    lastSeenAt:
      fixture.lastSeenMinutesAgo === null ? null : isoMinutesAgo(stubNow(), fixture.lastSeenMinutesAgo),
    createdAt: isoMinutesAgo(stubNow(), fixture.createdAtDaysAgo * 24 * 60),
  };
}

export function listMockSites(): Site[] {
  return SITE_FIXTURES.map((fixture) => {
    const devices = DEVICE_FIXTURES.filter((device) => device.siteId === fixture.id);
    const onlineCount = devices.filter((device) => device.status === 'online').length;
    const openAlertCount = ALERT_FIXTURES.filter(
      (alert) => alert.status === 'open' && devices.some((device) => device.id === alert.deviceId)
    ).length;
    const latest = devices.find((device) => device.status !== 'provisioning');
    const latestSample = latest ? latestWaveformSample(latest) : null;

    return {
      id: fixture.id,
      name: fixture.name,
      deviceCount: devices.length,
      onlineDeviceCount: onlineCount,
      openAlertCount,
      latestTemperatureC: latestSample ? Number(latestSample.temperatureC.toFixed(1)) : null,
      latestHumidityPct: latestSample ? Number(latestSample.humidityPct.toFixed(0)) : null,
      createdAt: isoMinutesAgo(stubNow(), fixture.createdAtDaysAgo * 24 * 60),
    };
  });
}

export function listMockDevices(siteId?: number): Device[] {
  return DEVICE_FIXTURES.filter((fixture) => siteId === undefined || fixture.siteId === siteId).map(toDevice);
}

export function getMockDeviceDetail(deviceId: number): DeviceDetail | undefined {
  const fixture = deviceFixtureById(deviceId);
  if (!fixture) return undefined;
  return {
    ...toDevice(fixture),
    thresholds: fixture.thresholds,
    automationRule: null,
  };
}

export function listMockCommands(deviceId: number): Command[] {
  return COMMAND_FIXTURES.filter((command) => command.deviceId === deviceId).sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  );
}

export function listMockAlerts(deviceId?: number): Alert[] {
  return ALERT_FIXTURES.filter((alert) => deviceId === undefined || alert.deviceId === deviceId);
}

/** Pure synthetic waveform shared by the series generator and the "latest reading" used on site cards. */
function waveformAt(fixture: DeviceFixture, hoursAgo: number): { temperatureC: number; humidityPct: number } {
  const t = -hoursAgo;
  const ripple = Math.sin(fixture.seed + t * 1.7) * 0.5 + Math.sin(fixture.seed * 2 + t * 0.43) * 0.35;
  let temperatureC = 22.5 + Math.sin((t / 24) * Math.PI * 2 - 1.9) * 4.2 + ripple * 1.1 + fixture.tempOffsetC;
  const humidityPct = Math.max(
    2,
    Math.min(98, 52 + Math.sin((t / 24) * Math.PI * 2 + 0.7) * 12 + ripple * 4 + fixture.humidityOffsetPct)
  );

  if (fixture.spikeMinutesAgo !== null) {
    const distanceMinutes = Math.abs(hoursAgo * 60 - fixture.spikeMinutesAgo);
    if (distanceMinutes < 60) {
      temperatureC += (60 - distanceMinutes) / 60 * 7.2;
    }
  }

  return { temperatureC, humidityPct };
}

function latestWaveformSample(fixture: DeviceFixture): { temperatureC: number; humidityPct: number } {
  return waveformAt(fixture, 0);
}

export function getMockTelemetrySeries(
  deviceId: number,
  range: '24h' | '7d',
  sensorType: SensorTypeCode
): TelemetrySeriesResponse {
  const fixture = deviceFixtureById(deviceId);
  const thresholds = (fixture?.thresholds ?? []).filter((threshold) => threshold.sensorType === sensorType);

  if (!fixture) {
    return { points: [], thresholds };
  }

  const isAggregated = range === '7d';
  const stepMinutes = range === '24h' ? 10 : 60;
  const count = range === '24h' ? 144 : 168;
  const now = stubNow();

  const points: TelemetrySeriesPoint[] = Array.from({ length: count }, (_, index) => {
    const minutesAgo = (count - 1 - index) * stepMinutes;
    const sample = waveformAt(fixture, minutesAgo / 60);
    return {
      timestamp: new Date(now - minutesAgo * MINUTE_MS).toISOString(),
      temperatureC: sensorType === 'temperature' ? Number(sample.temperatureC.toFixed(2)) : null,
      humidityPct: sensorType === 'humidity' ? Number(sample.humidityPct.toFixed(1)) : null,
      isAggregated,
    };
  });

  return { points, thresholds };
}
