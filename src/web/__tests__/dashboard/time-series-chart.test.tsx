import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import TimeSeriesChart from '../../components/dashboard/TimeSeriesChart';
import ja from '../../locales/ja.json';
import type { ChartPoint } from '../../lib/dashboard/chart';
import type { components } from '@contracts/api';

type Threshold = components['schemas']['Threshold'];

const points: ChartPoint[] = Array.from({ length: 6 }, (_, index) => ({
  timestamp: new Date(Date.now() - (5 - index) * 60 * 60 * 1000).toISOString(),
  temperatureC: 20 + index,
  humidityPct: 50 + index,
}));

const thresholds: Threshold[] = [
  { sensorType: 'temperature', direction: 'upper', triggerValue: 28, deadband: 1, breachState: 'NORMAL' },
  { sensorType: 'temperature', direction: 'lower', triggerValue: 5, deadband: 1, breachState: 'NORMAL' },
];

function renderChart() {
  return render(
    <NextIntlClientProvider locale="ja" messages={ja}>
      <TimeSeriesChart points={points} thresholds={thresholds} />
    </NextIntlClientProvider>
  );
}

describe('TimeSeriesChart (Issue #18: 24h/7d graph with threshold lines)', () => {
  it('renders the legend for temperature, humidity and the upper threshold line', () => {
    renderChart();
    expect(screen.getByText(ja.dashboard.device.legendTemperature)).toBeInTheDocument();
    expect(screen.getByText(ja.dashboard.device.legendHumidity)).toBeInTheDocument();
    expect(screen.getByText(ja.dashboard.device.legendUpperThreshold)).toBeInTheDocument();
  });

  it('renders an SVG with the expected viewBox and both series paths', () => {
    const { container } = renderChart();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 720 220');
    // temp line + temp area + humidity line = at least 3 <path> elements.
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(3);
  });

  it('labels the most recent x-axis tick as "just now"', () => {
    renderChart();
    expect(screen.getByText(ja.dashboard.relativeTime.justNow)).toBeInTheDocument();
  });

  it('renders temperature axis labels with the localized unit', () => {
    renderChart();
    expect(screen.getByText(`40${ja.dashboard.device.axisTemperatureUnit}`)).toBeInTheDocument();
    expect(screen.getByText(`0${ja.dashboard.device.axisTemperatureUnit}`)).toBeInTheDocument();
  });

  it('omits the lower-threshold legend/line when no lower threshold is configured', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={ja}>
        <TimeSeriesChart
          points={points}
          thresholds={thresholds.filter((t) => t.direction === 'upper')}
        />
      </NextIntlClientProvider>
    );
    expect(screen.queryByText(ja.dashboard.device.legendLowerThreshold)).not.toBeInTheDocument();
  });
});
