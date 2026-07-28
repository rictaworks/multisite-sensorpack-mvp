'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { listMockSites, listMockDevices } from '../../lib/dashboard/mockData';
import { usePolling, DEFAULT_POLLING_INTERVAL_MS } from '../../lib/dashboard/usePolling';
import { describeElapsed } from '../../lib/dashboard/relativeTime';
import DeviceStatusDot from './DeviceStatusDot';

/**
 * F6.2 — multi-site overview: per-site device/online/open-alert counts and
 * latest temperature/humidity, refreshed every 30s (Issue #18 acceptance
 * criteria; default matches app-ui/'s dc-script `pollingSeconds` default).
 * Data comes from lib/dashboard/mockData.ts — a stub shaped exactly like the
 * `/dashboard/sites-summary` and `/devices` contract responses (real Rails
 * wiring is a later issue).
 */
export default function SitesOverview() {
  const t = useTranslations('dashboard.overview');
  const tDevice = useTranslations('dashboard.device');
  const tRelative = useTranslations('dashboard.relativeTime');
  // `usePolling` re-renders this component every interval on its own (its
  // internal setState is enough to trigger that): we don't need to key a
  // useMemo off `tickCount` for that, we just re-derive `sites` plainly below.
  // `lastUpdatedAt` is state (not a fresh Date.now() read), so using it as the
  // "now" anchor for relative-time formatting keeps render pure.
  const { lastUpdatedAt } = usePolling(DEFAULT_POLLING_INTERVAL_MS);

  const sites = listMockSites();

  const totals = useMemo(
    () =>
      sites.reduce(
        (acc, site) => ({
          devices: acc.devices + site.deviceCount,
          online: acc.online + site.onlineDeviceCount,
          openAlerts: acc.openAlerts + site.openAlertCount,
        }),
        { devices: 0, online: 0, openAlerts: 0 }
      ),
    [sites]
  );

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

      {sites.length === 0 ? (
        <p style={{ marginTop: 28 }}>{t('emptySites')}</p>
      ) : (
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
              const devices = listMockDevices(site.id);
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
                    {devices.map((device) => (
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
