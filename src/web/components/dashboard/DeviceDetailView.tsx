'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import {
  getMockDeviceDetail,
  listMockCommands,
  listMockAlerts,
  listMockSites,
  getMockTelemetrySeries,
} from '../../lib/dashboard/mockData';
import { usePolling, DEFAULT_POLLING_INTERVAL_MS } from '../../lib/dashboard/usePolling';
import { describeElapsed } from '../../lib/dashboard/relativeTime';
import { computeSeriesSummary, type ChartPoint } from '../../lib/dashboard/chart';
import TimeSeriesChart from './TimeSeriesChart';
import DeviceStatusDot from './DeviceStatusDot';
import type { components } from '@contracts/api';

type TelemetryRange = '24h' | '7d';
type DeviceStatus = components['schemas']['DeviceStatus'];

const STEP_MINUTES: Record<TelemetryRange, number> = { '24h': 10, '7d': 60 };

export interface DeviceDetailViewProps {
  deviceId: number;
}

/**
 * F6.3 — device detail: 24h/7d time-series with threshold lines, command
 * history and alert history for a single device (Issue #18 acceptance
 * criteria). Backed by the same contract-shaped stub as SitesOverview; real
 * Rails wiring is a later issue.
 */
export default function DeviceDetailView({ deviceId }: DeviceDetailViewProps) {
  const t = useTranslations('dashboard.device');
  const tOverview = useTranslations('dashboard.overview');
  const tCommandType = useTranslations('dashboard.commandType');
  const tCommandStatus = useTranslations('dashboard.commandStatus');
  const tAlertType = useTranslations('dashboard.alertType');
  const tAlertStatus = useTranslations('dashboard.alertStatus');
  const tRelative = useTranslations('dashboard.relativeTime');
  const [range, setRange] = useState<TelemetryRange>('24h');
  // `usePolling` re-renders this component every interval on its own; the
  // lookups below are plain (cheap, deterministic fixture reads) so they
  // don't need a useMemo keyed on a tick counter to "refresh". `lastUpdatedAt`
  // is React state (not a fresh Date.now() read), so using it as the "now"
  // anchor for relative-time formatting keeps render pure.
  const { lastUpdatedAt } = usePolling(DEFAULT_POLLING_INTERVAL_MS);

  const detail = getMockDeviceDetail(deviceId);
  const siteName = detail ? listMockSites().find((site) => site.id === detail.siteId)?.name : undefined;
  const commands = listMockCommands(deviceId);
  const alerts = listMockAlerts(deviceId);

  const { points, thresholds } = useMemo(() => {
    if (!detail) return { points: [] as ChartPoint[], thresholds: [] as components['schemas']['Threshold'][] };
    const temperature = getMockTelemetrySeries(deviceId, range, 'temperature');
    const humidity = getMockTelemetrySeries(deviceId, range, 'humidity');
    const merged: ChartPoint[] = temperature.points.map((point, index) => ({
      timestamp: point.timestamp,
      temperatureC: point.temperatureC ?? null,
      humidityPct: humidity.points[index]?.humidityPct ?? null,
    }));
    return { points: merged, thresholds: temperature.thresholds };
  }, [detail, deviceId, range]);

  const summary = useMemo(
    () => computeSeriesSummary(points, thresholds, STEP_MINUTES[range]),
    [points, thresholds, range]
  );

  if (!detail) {
    return (
      <div>
        <Link href="/dashboard">{t('backToOverview')}</Link>
        <p style={{ marginTop: 16 }}>{t('notFound')}</p>
      </div>
    );
  }

  function statusLabel(status: DeviceStatus): string {
    if (status === 'online') return t('statusOnline');
    if (status === 'offline') return t('statusOffline');
    return t('statusProvisioning');
  }

  function formatElapsed(timestamp: string): string {
    const description = describeElapsed(lastUpdatedAt, Date.parse(timestamp));
    if (description.unit === 'justNow') return tRelative('justNow');
    return tRelative(description.unit, { value: description.value });
  }

  function formatOverThresholdDuration(minutes: number): string {
    if (minutes >= 60) return t('hoursUnit', { hours: Math.round(minutes / 60) });
    return t('minutesUnit', { minutes });
  }

  return (
    <div>
      <Link href="/dashboard">{t('backToOverview')}</Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
        <div>
          {siteName && <div style={{ fontSize: 12, color: '#a8c8ff' }}>{siteName}</div>}
          <h1 style={{ margin: '6px 0 10px', fontSize: 25, fontWeight: 900 }}>
            {tOverview('deviceLabel', { id: detail.id })}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <DeviceStatusDot status={detail.status} />
              {statusLabel(detail.status)}
            </span>
            {detail.lastSeenAt && <span>{t('lastSeen', { time: formatElapsed(detail.lastSeenAt) })}</span>}
            <span>{t('intervalSeconds', { seconds: detail.expectedIntervalSec })}</span>
          </div>
        </div>

        <div role="group" style={{ display: 'flex', gap: 6 }}>
          <button type="button" aria-pressed={range === '24h'} onClick={() => setRange('24h')}>
            {t('range24h')}
          </button>
          <button type="button" aria-pressed={range === '7d'} onClick={() => setRange('7d')}>
            {t('range7d')}
          </button>
        </div>
      </div>

      {detail.status === 'offline' && (
        <div style={{ marginTop: 16, background: '#fff4e5', border: '1px solid #ffd8a8', borderRadius: 6, padding: '12px 14px' }}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" style={{ marginInlineEnd: 8 }} />
          {t('offlineWarning')}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 8, padding: 24, marginTop: 22, color: '#0a1628' }}>
        <TimeSeriesChart points={points} thresholds={thresholds} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 16, borderTop: '1px solid rgba(10,22,40,0.1)', paddingTop: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('summaryMaxTemp')}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {summary.maxTempC !== null ? `${summary.maxTempC.toFixed(1)}${t('axisTemperatureUnit')}` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('summaryMinTemp')}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {summary.minTempC !== null ? `${summary.minTempC.toFixed(1)}${t('axisTemperatureUnit')}` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('summaryAvgTemp')}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {summary.avgTempC !== null ? `${summary.avgTempC.toFixed(1)}${t('axisTemperatureUnit')}` : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('summaryOverThreshold')}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{formatOverThresholdDuration(summary.minutesOverUpperThreshold)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('summaryAvgHumidity')}</div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>
              {summary.avgHumidityPct !== null ? `${summary.avgHumidityPct.toFixed(0)}${t('axisHumidityUnit')}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 20 }}>
        <div style={{ background: '#102040', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t('commandsTitle')}</div>
          {commands.length === 0 ? (
            <div>{t('noCommands')}</div>
          ) : (
            <div data-testid="command-history" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {commands.map((command) => (
                <div key={command.id} data-testid="command-row" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '11px 13px' }}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{tCommandType(command.commandType)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{formatElapsed(command.issuedAt)}</span>
                  <span>{tCommandStatus(command.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#102040', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{t('alertsTitle')}</div>
          {alerts.length === 0 ? (
            <div>{t('noAlerts')}</div>
          ) : (
            <div data-testid="alert-history" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {alerts.map((alert) => (
                <div key={alert.id} data-testid="alert-row" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '11px 13px' }}>
                  <span style={{ flex: 1, fontSize: 12.5 }}>{tAlertType(alert.alertType)}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{formatElapsed(alert.openedAt)}</span>
                  <span>{tAlertStatus(alert.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
