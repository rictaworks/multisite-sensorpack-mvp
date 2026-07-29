'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { fetchDevices, fetchSitesSummary, type Device, type Site } from '../../lib/dashboard/dashboardApi';
import { usePolling, DEFAULT_POLLING_INTERVAL_MS } from '../../lib/dashboard/usePolling';
import { describeElapsed } from '../../lib/dashboard/relativeTime';
import DeviceStatusDot from './DeviceStatusDot';

/**
 * F6.2 — multi-site overview: per-site device/online/open-alert counts and
 * latest temperature/humidity, refreshed every 30s (Issue #18 acceptance
 * criteria; default matches app-ui/'s dc-script `pollingSeconds` default).
 *
 * Data comes from the real Rails API (`GET /dashboard/sites-summary` and
 * `GET /devices`) through the same-origin proxy. The contract-shaped stub this
 * screen used to read (lib/dashboard/mockData.ts) has been removed.
 */

type OverviewState =
  | { status: 'loading' }
  | { status: 'ready'; sites: Site[]; devices: Device[] }
  // 取得できていないことを「拠点0件」と同じ見た目にしない。同じにすると、
  // ユーザーは自分の拠点が消えたと誤解する(.claude/rules/coding-style.md フォールバック禁止)。
  | { status: 'error' };

export default function SitesOverview() {
  const t = useTranslations('dashboard.overview');
  const tDevice = useTranslations('dashboard.device');
  const tRelative = useTranslations('dashboard.relativeTime');

  const [state, setState] = useState<OverviewState>({ status: 'loading' });
  // ポーリングでの再取得に失敗した状態。初回取得失敗(status: 'error')とは区別する:
  // 前回取得できた内容は表示したまま、「いま見えているのは最新ではない」ことだけを伝える。
  const [refreshFailed, setRefreshFailed] = useState(false);

  // `lastUpdatedAt` はReactのstate(レンダー中のDate.now()読み取りではない)なので、
  // 相対時刻の基準に使ってもレンダーは純粋なまま保たれる。
  const { tickCount, lastUpdatedAt } = usePolling(DEFAULT_POLLING_INTERVAL_MS);

  useEffect(() => {
    // アンマウント後に状態を更新しないための番兵。
    let cancelled = false;

    // 拠点カードごとに `?siteId=` を付けて引くと拠点数ぶんリクエストが増えるため、
    // デバイスは一度にまとめて取得し、下で siteId ごとに束ねる。
    Promise.all([fetchSitesSummary(), fetchDevices()])
      .then(([sites, devices]) => {
        if (cancelled) return;
        setState({ status: 'ready', sites, devices });
        setRefreshFailed(false);
      })
      .catch((error: unknown) => {
        console.error('[SitesOverview] failed to load dashboard data', error);
        if (cancelled) return;
        // 既に表示できている内容があるなら消さない。消すと、通信が一度失敗しただけで
        // 画面が空になり、拠点が無くなったように見える。
        setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
        setRefreshFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [tickCount]);

  const sites = state.status === 'ready' ? state.sites : [];

  const devicesBySiteId = useMemo(() => {
    const grouped = new Map<number, Device[]>();
    if (state.status !== 'ready') return grouped;

    state.devices.forEach((device) => {
      const list = grouped.get(device.siteId);
      if (list) {
        list.push(device);
      } else {
        grouped.set(device.siteId, [device]);
      }
    });
    return grouped;
  }, [state]);

  const totals = useMemo(() => {
    const empty = { devices: 0, online: 0, openAlerts: 0 };
    if (state.status !== 'ready') return empty;

    return state.sites.reduce(
      (acc, site) => ({
        devices: acc.devices + site.deviceCount,
        online: acc.online + site.onlineDeviceCount,
        openAlerts: acc.openAlerts + site.openAlertCount,
      }),
      empty
    );
  }, [state]);

  function formatElapsed(timestamp: string): string {
    const description = describeElapsed(lastUpdatedAt, Date.parse(timestamp));
    if (description.unit === 'justNow') return tRelative('justNow');
    return tRelative(description.unit, { value: description.value });
  }

  function deviceStatusLabel(status: 'provisioning' | 'online' | 'offline'): string {
    if (status === 'online') return tDevice('statusOnline');
    if (status === 'offline') return tDevice('statusOffline');
    return tDevice('statusProvisioning');
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#a8c8ff' }}>
        {t('eyebrow')}
      </div>
      <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t('title')}</h1>
      <div style={{ width: 48, height: 3, background: '#1a73e8', marginTop: 14 }} />

      {state.status === 'loading' && <p style={{ marginTop: 28 }}>{t('loading')}</p>}
      {state.status === 'error' && (
        <p role="alert" style={{ marginTop: 28 }}>
          {t('loadError')}
        </p>
      )}
      {state.status === 'ready' && refreshFailed && (
        <p role="alert" style={{ marginTop: 20 }}>
          {t('refreshError')}
        </p>
      )}

      {state.status === 'ready' && sites.length === 0 && <p style={{ marginTop: 28 }}>{t('emptySites')}</p>}

      {state.status === 'ready' && sites.length > 0 && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 14,
              margin: '28px 0 30px',
            }}
          >
            <div>
              <div>{t('statSites')}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <span data-testid="stat-sites-value" style={{ fontSize: 32, fontWeight: 800 }}>
                  {sites.length}
                </span>
                <span style={{ fontSize: 12 }}>{t('unitSites')}</span>
              </div>
            </div>
            <div>
              <div>{t('statDevices')}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <span data-testid="stat-devices-value" style={{ fontSize: 32, fontWeight: 800 }}>
                  {totals.devices}
                </span>
                <span style={{ fontSize: 12 }}>{t('unitDevices')}</span>
              </div>
            </div>
            <div>
              <div>{t('statOnline')}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <span data-testid="stat-online-value" style={{ fontSize: 32, fontWeight: 800 }}>
                  {totals.online}
                </span>
                <span style={{ fontSize: 12 }}>{t('unitDevices')}</span>
              </div>
            </div>
            <div>
              <div>{t('statOpenAlerts')}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                <span data-testid="stat-open-alerts-value" style={{ fontSize: 32, fontWeight: 800 }}>
                  {totals.openAlerts}
                </span>
                <span style={{ fontSize: 12 }}>{t('unitAlerts')}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
            {sites.map((site) => {
              const siteDevices = devicesBySiteId.get(site.id) ?? [];
              const allOnline = site.deviceCount > 0 && site.onlineDeviceCount === site.deviceCount;

              return (
                <div key={site.id} data-testid={`site-card-${site.id}`} style={{ background: '#fff', borderRadius: 8, padding: 26 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 19, fontWeight: 700 }}>{site.name}</div>
                      <div style={{ fontSize: 12, color: '#6b82a0', marginTop: 10 }}>
                        {t('siteMeta', { deviceCount: site.deviceCount })}
                      </div>
                    </div>
                    <span>{allOnline ? t('badgeAllOnline') : t('badgeSomeOffline')}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 26, margin: '22px 0 20px' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('currentTemperature')}</div>
                      <div style={{ fontSize: 34, fontWeight: 800 }}>
                        {site.latestTemperatureC != null ? `${site.latestTemperatureC}${tDevice('axisTemperatureUnit')}` : t('noReading')}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b82a0' }}>{t('currentHumidity')}</div>
                      <div style={{ fontSize: 34, fontWeight: 800 }}>
                        {site.latestHumidityPct != null ? `${site.latestHumidityPct}${tDevice('axisHumidityUnit')}` : t('noReading')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(10,22,40,0.1)', paddingTop: 16 }}>
                    {siteDevices.map((device) => (
                      <Link
                        key={device.id}
                        href={`/dashboard/${device.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f0f4f8', borderRadius: 6, padding: '12px 14px' }}
                      >
                        <DeviceStatusDot status={device.status} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t('deviceLabel', { id: device.id })}</span>
                        <span style={{ fontSize: 11.5, color: '#6b82a0' }}>
                          {deviceStatusLabel(device.status)}
                          {device.lastSeenAt ? ` · ${formatElapsed(device.lastSeenAt)}` : ''}
                        </span>
                        <i className="fa-solid fa-angles-right" aria-hidden="true" style={{ color: '#1a73e8' }} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
