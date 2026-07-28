import type { components } from '@contracts/api';

/**
 * Pure SVG-geometry + summary-stat computation for the device detail time
 * series chart (Issue #18 acceptance criteria: 24h/7d graph with threshold
 * lines). Kept free of React/DOM so it can be unit tested directly and so
 * <TimeSeriesChart /> stays a thin, purely presentational wrapper.
 *
 * Layout constants mirror the reference mock (app-ui/SensorPack Dashboard.dc.html):
 * a 720x220 viewBox, temperature scaled 0-40C, humidity scaled 0-100%.
 */

type Threshold = components['schemas']['Threshold'];

export interface ChartPoint {
  timestamp: string;
  temperatureC: number | null;
  humidityPct: number | null;
}

export const CHART_WIDTH = 720;
export const CHART_HEIGHT = 220;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 8;
const TEMP_MIN_C = 0;
const TEMP_MAX_C = 40;
const HUMIDITY_MIN_PCT = 0;
const HUMIDITY_MAX_PCT = 100;
const X_TICK_COUNT = 5;

export interface ChartGeometry {
  width: number;
  height: number;
  tempPath: string;
  tempAreaPath: string;
  humidityPath: string;
  upperThresholdY: number | null;
  lowerThresholdY: number | null;
  gridYs: number[];
  tempAxisLabelsC: number[];
  humidityAxisLabelsPct: number[];
  xTicks: { x: number; hoursAgo: number }[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleY(value: number, min: number, max: number): number {
  const usable = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  return PADDING_TOP + (1 - (clamp(value, min, max) - min) / (max - min)) * usable;
}

function xAt(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index * CHART_WIDTH) / (count - 1);
}

function buildPath(points: ChartPoint[], select: (point: ChartPoint) => number | null, scale: (value: number) => number): string {
  const commands: string[] = [];
  points.forEach((point, index) => {
    const value = select(point);
    if (value === null) return;
    const x = xAt(index, points.length).toFixed(1);
    const y = scale(value).toFixed(1);
    commands.push(`${commands.length === 0 ? 'M' : 'L'}${x} ${y}`);
  });
  return commands.join(' ');
}

function thresholdY(thresholds: Threshold[], direction: components['schemas']['ThresholdDirection']): number | null {
  const match = thresholds.find((threshold) => threshold.sensorType === 'temperature' && threshold.direction === direction);
  if (!match) return null;
  return scaleY(match.triggerValue, TEMP_MIN_C, TEMP_MAX_C);
}

export function buildChartGeometry(points: ChartPoint[], thresholds: Threshold[]): ChartGeometry {
  const tempScale = (value: number) => scaleY(value, TEMP_MIN_C, TEMP_MAX_C);
  const humidityScale = (value: number) => scaleY(value, HUMIDITY_MIN_PCT, HUMIDITY_MAX_PCT);

  const tempPath = buildPath(points, (point) => point.temperatureC, tempScale);
  const floorY = CHART_HEIGHT - PADDING_BOTTOM;
  const tempAreaPath = tempPath ? `${tempPath} L${CHART_WIDTH} ${floorY} L0 ${floorY} Z` : '';

  const gridYs = [0, 10, 20, 30, 40].map((value) => scaleY(value, TEMP_MIN_C, TEMP_MAX_C));
  const tempAxisLabelsC = [40, 30, 20, 10, 0];
  const humidityAxisLabelsPct = [100, 75, 50, 25, 0];

  const xTicks = Array.from({ length: X_TICK_COUNT }, (_, tickIndex) => {
    const pointIndex = Math.round((tickIndex * (points.length - 1)) / (X_TICK_COUNT - 1));
    const stepsFromNewest = points.length - 1 - pointIndex;
    const totalMs =
      points.length > 1
        ? Date.parse(points[points.length - 1].timestamp) - Date.parse(points[0].timestamp)
        : 0;
    const msPerStep = points.length > 1 ? totalMs / (points.length - 1) : 0;
    return {
      x: xAt(pointIndex, points.length),
      hoursAgo: (stepsFromNewest * msPerStep) / (60 * 60 * 1000),
    };
  });

  return {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    tempPath,
    tempAreaPath,
    humidityPath: buildPath(points, (point) => point.humidityPct, humidityScale),
    upperThresholdY: thresholdY(thresholds, 'upper'),
    lowerThresholdY: thresholdY(thresholds, 'lower'),
    gridYs,
    tempAxisLabelsC,
    humidityAxisLabelsPct,
    xTicks,
  };
}

export interface SeriesSummary {
  maxTempC: number | null;
  minTempC: number | null;
  avgTempC: number | null;
  avgHumidityPct: number | null;
  minutesOverUpperThreshold: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeSeriesSummary(points: ChartPoint[], thresholds: Threshold[], stepMinutes: number): SeriesSummary {
  const temps = points.map((point) => point.temperatureC).filter((value): value is number => value !== null);
  const humidities = points.map((point) => point.humidityPct).filter((value): value is number => value !== null);

  const upperThreshold = thresholds.find(
    (threshold) => threshold.sensorType === 'temperature' && threshold.direction === 'upper'
  );
  const overCount = upperThreshold
    ? temps.filter((temperatureC) => temperatureC > upperThreshold.triggerValue).length
    : 0;

  return {
    maxTempC: temps.length > 0 ? Math.max(...temps) : null,
    minTempC: temps.length > 0 ? Math.min(...temps) : null,
    avgTempC: average(temps),
    avgHumidityPct: average(humidities),
    minutesOverUpperThreshold: overCount * stepMinutes,
  };
}
