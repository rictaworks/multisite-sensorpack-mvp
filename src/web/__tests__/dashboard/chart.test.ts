import { buildChartGeometry, computeSeriesSummary, type ChartPoint } from '../../lib/dashboard/chart';
import type { components } from '@contracts/api';

type Threshold = components['schemas']['Threshold'];

function point(hoursAgo: number, temperatureC: number, humidityPct: number): ChartPoint {
  const now = Date.parse('2026-07-28T12:00:00.000Z');
  return {
    timestamp: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
    temperatureC,
    humidityPct,
  };
}

const UPPER_THRESHOLD: Threshold = {
  sensorType: 'temperature',
  direction: 'upper',
  triggerValue: 28,
  deadband: 1,
  breachState: 'NORMAL',
};
const LOWER_THRESHOLD: Threshold = {
  sensorType: 'temperature',
  direction: 'lower',
  triggerValue: 5,
  deadband: 1,
  breachState: 'NORMAL',
};

describe('buildChartGeometry (SVG geometry for the 24h/7d temperature+humidity chart)', () => {
  const points: ChartPoint[] = [
    point(4, 20, 50),
    point(3, 22, 55),
    point(2, 24, 60),
    point(1, 26, 58),
    point(0, 30, 52),
  ];

  it('builds an SVG path with one Move command followed by a Line per remaining point', () => {
    const geometry = buildChartGeometry(points, [UPPER_THRESHOLD, LOWER_THRESHOLD]);
    expect(geometry.tempPath.startsWith('M')).toBe(true);
    expect((geometry.tempPath.match(/L/g) ?? []).length).toBe(points.length - 1);
    expect(geometry.humidityPath.startsWith('M')).toBe(true);
  });

  it('places threshold lines using the same 0-40C vertical scale as the temperature series', () => {
    const geometry = buildChartGeometry(points, [UPPER_THRESHOLD, LOWER_THRESHOLD]);
    expect(geometry.upperThresholdY).not.toBeNull();
    expect(geometry.lowerThresholdY).not.toBeNull();
    // Upper threshold (28C, hotter) must render higher on screen (smaller y) than the lower threshold (5C).
    expect(geometry.upperThresholdY as number).toBeLessThan(geometry.lowerThresholdY as number);
  });

  it('returns null threshold Ys when no threshold of that direction is configured', () => {
    const geometry = buildChartGeometry(points, [UPPER_THRESHOLD]);
    expect(geometry.lowerThresholdY).toBeNull();
  });

  it('produces exactly 5 evenly spaced x-axis ticks spanning from oldest to "now"', () => {
    const geometry = buildChartGeometry(points, [UPPER_THRESHOLD, LOWER_THRESHOLD]);
    expect(geometry.xTicks).toHaveLength(5);
    expect(geometry.xTicks[0].hoursAgo).toBeCloseTo(4, 5);
    expect(geometry.xTicks[geometry.xTicks.length - 1].hoursAgo).toBeCloseTo(0, 5);
  });
});

describe('computeSeriesSummary (headline stats under the chart)', () => {
  const points: ChartPoint[] = [
    point(4, 20, 50),
    point(3, 22, 55),
    point(2, 30, 60),
    point(1, 26, 58),
    point(0, 24, 52),
  ];

  it('computes max/min/avg temperature and avg humidity, ignoring null readings', () => {
    const withGap: ChartPoint[] = [...points, { timestamp: point(-1, 0, 0).timestamp, temperatureC: null, humidityPct: null }];
    const summary = computeSeriesSummary(withGap, [UPPER_THRESHOLD, LOWER_THRESHOLD], 60);
    expect(summary.maxTempC).toBe(30);
    expect(summary.minTempC).toBe(20);
    expect(summary.avgTempC).toBeCloseTo((20 + 22 + 30 + 26 + 24) / 5, 5);
    expect(summary.avgHumidityPct).toBeCloseTo((50 + 55 + 60 + 58 + 52) / 5, 5);
  });

  it('sums minutes spent above the upper threshold using the series step size', () => {
    const summary = computeSeriesSummary(points, [UPPER_THRESHOLD, LOWER_THRESHOLD], 60);
    // Only the 30C point breaches the 28C upper threshold => 1 sample * 60min step.
    expect(summary.minutesOverUpperThreshold).toBe(60);
  });

  it('returns nulls (not NaN) when every point in the series is null', () => {
    const emptyPoints: ChartPoint[] = [{ timestamp: point(0, 0, 0).timestamp, temperatureC: null, humidityPct: null }];
    const summary = computeSeriesSummary(emptyPoints, [UPPER_THRESHOLD], 60);
    expect(summary.maxTempC).toBeNull();
    expect(summary.minTempC).toBeNull();
    expect(summary.avgTempC).toBeNull();
    expect(summary.avgHumidityPct).toBeNull();
    expect(summary.minutesOverUpperThreshold).toBe(0);
  });
});
