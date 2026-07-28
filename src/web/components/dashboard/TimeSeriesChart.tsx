'use client';

import { useTranslations } from 'next-intl';
import type { components } from '@contracts/api';
import { buildChartGeometry, type ChartPoint } from '../../lib/dashboard/chart';

type Threshold = components['schemas']['Threshold'];

export interface TimeSeriesChartProps {
  points: ChartPoint[];
  thresholds: Threshold[];
}

/**
 * Renders the dual-axis (temperature left / humidity right) time-series
 * chart with threshold lines for the device detail screen (Issue #18
 * acceptance criteria). Purely presentational: all geometry math lives in
 * lib/dashboard/chart.ts so it stays unit-testable without a DOM.
 */
export default function TimeSeriesChart({ points, thresholds }: TimeSeriesChartProps) {
  const t = useTranslations('dashboard.device');
  const tRelative = useTranslations('dashboard.relativeTime');
  const geometry = buildChartGeometry(points, thresholds);

  function formatHoursAgo(hoursAgo: number): string {
    if (hoursAgo < 0.5) return tRelative('justNow');
    if (hoursAgo < 24) return tRelative('hours', { value: Math.round(hoursAgo) });
    return tRelative('days', { value: Math.round(hoursAgo / 24) });
  }

  return (
    <section aria-label={t('chartTitle')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontWeight: 700 }}>{t('chartTitle')}</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11.5 }}>
          <span>
            <i className="fa-solid fa-minus" aria-hidden="true" style={{ color: '#1a73e8', marginInlineEnd: 6 }} />
            {t('legendTemperature')}
          </span>
          <span>
            <i className="fa-solid fa-minus" aria-hidden="true" style={{ color: '#64b5f6', marginInlineEnd: 6 }} />
            {t('legendHumidity')}
          </span>
          {geometry.upperThresholdY !== null && (
            <span>
              <i className="fa-solid fa-grip-lines" aria-hidden="true" style={{ color: '#e5484d', marginInlineEnd: 6 }} />
              {t('legendUpperThreshold')}
            </span>
          )}
          {geometry.lowerThresholdY !== null && (
            <span>
              <i className="fa-solid fa-grip-lines" aria-hidden="true" style={{ color: '#6b82a0', marginInlineEnd: 6 }} />
              {t('legendLowerThreshold')}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 34,
            height: geometry.height,
            fontSize: 9,
            textAlign: 'end',
            flex: 'none',
          }}
        >
          {geometry.tempAxisLabelsC.map((label) => (
            <span key={`temp-axis-${label}`}>{`${label}${t('axisTemperatureUnit')}`}</span>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <svg
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: geometry.height, display: 'block' }}
            role="img"
            aria-label={t('chartTitle')}
          >
            {geometry.gridYs.map((y) => (
              <line key={`grid-${y}`} x1={0} y1={y} x2={geometry.width} y2={y} stroke="rgba(10,22,40,0.08)" strokeWidth={1} />
            ))}
            {geometry.tempAreaPath && <path d={geometry.tempAreaPath} fill="rgba(26,115,232,0.08)" stroke="none" />}
            {geometry.humidityPath && (
              <path d={geometry.humidityPath} fill="none" stroke="#64b5f6" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            )}
            {geometry.tempPath && (
              <path d={geometry.tempPath} fill="none" stroke="#1a73e8" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
            )}
            {geometry.upperThresholdY !== null && (
              <line
                x1={0}
                y1={geometry.upperThresholdY}
                x2={geometry.width}
                y2={geometry.upperThresholdY}
                stroke="#e5484d"
                strokeWidth={1.4}
                strokeDasharray="6 5"
              />
            )}
            {geometry.lowerThresholdY !== null && (
              <line
                x1={0}
                y1={geometry.lowerThresholdY}
                x2={geometry.width}
                y2={geometry.lowerThresholdY}
                stroke="rgba(107,130,160,0.7)"
                strokeWidth={1.2}
                strokeDasharray="3 5"
              />
            )}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9.5 }}>
            {geometry.xTicks.map((tick, index) => (
              <span key={`x-tick-${index}`}>{formatHoursAgo(tick.hoursAgo)}</span>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 34,
            height: geometry.height,
            fontSize: 9,
            flex: 'none',
          }}
        >
          {geometry.humidityAxisLabelsPct.map((label) => (
            <span key={`humidity-axis-${label}`}>{`${label}${t('axisHumidityUnit')}`}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
