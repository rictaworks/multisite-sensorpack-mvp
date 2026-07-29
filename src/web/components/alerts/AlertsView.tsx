'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import AlertBadge from './AlertBadge';
import { acknowledgeAlert, listAlerts, type Alert, type AlertStatus } from './alertsApi';
import { getAlertMessageKey, SEVERITY_COLORS, STATUS_COLORS } from './alertPresentation';
import styles from './AlertsView.module.css';

const TAB_ORDER: AlertStatus[] = ['open', 'acknowledged', 'closed'];

function formatOpenedAt(isoTimestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoTimestamp));
}

/**
 * お知らせ（アラート）一覧・ack画面（Issue #20, requirements.md F8）。
 *
 * データは実API（`GET /alerts` / `POST /alerts/{id}/ack`）から取得する。
 * かつてのインメモリのモック（alertsRepository.ts）は撤去した。
 */
export default function AlertsView() {
  const t = useTranslations('alerts');
  // 契約(openapi.yaml)のDeviceに表示名のフィールドは無いため、IDから表記を作る。
  // ダッシュボード・運用ツールと同じ文言を使う: 同じ機器が画面によって違う名前で
  // 出ると、どの機器のアラートなのか分からなくなる。
  const tDeviceLabel = useTranslations('dashboard.overview');

  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<AlertStatus>('open');
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [ackErrorId, setAckErrorId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    console.debug('[AlertsView] loading alerts');

    listAlerts()
      .then((loaded) => {
        if (cancelled) return;
        setAlerts(loaded);
        setLoadError(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[AlertsView] failed to load alerts', error);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const countsByStatus = useMemo(() => {
    const counts: Record<AlertStatus, number> = { open: 0, acknowledged: 0, closed: 0 };
    (alerts ?? []).forEach((alert) => {
      counts[alert.status] += 1;
    });
    return counts;
  }, [alerts]);

  const visibleAlerts = useMemo(
    () => (alerts ?? []).filter((alert) => alert.status === activeTab),
    [alerts, activeTab]
  );

  async function handleAcknowledge(alertId: number): Promise<void> {
    setAckingId(alertId);
    setAckErrorId(null);
    try {
      const updated = await acknowledgeAlert(alertId);
      setAlerts((previous) =>
        (previous ?? []).map((alert) => (alert.id === updated.id ? updated : alert))
      );
    } catch (error) {
      console.error('[AlertsView] failed to acknowledge alert', { alertId, error });
      setAckErrorId(alertId);
    } finally {
      setAckingId(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.kicker}>{t('kicker')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        <AlertBadge openCount={countsByStatus.open} />
      </div>

      <div className={styles.tabs}>
        {TAB_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={activeTab === status}
            className={activeTab === status ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(status)}
          >
            {t('tabLabelWithCount', {
              label: t(`tabs.${status}`),
              count: countsByStatus[status],
            })}
          </button>
        ))}
      </div>

      {alerts === null && !loadError && <p className={styles.status}>{t('loading')}</p>}
      {loadError && <p className={styles.statusError}>{t('loadError')}</p>}

      {alerts !== null && (
        <div className={styles.list}>
          {visibleAlerts.map((alert) => {
            const messageKey = getAlertMessageKey(alert.alertType);
            const deviceLabel = tDeviceLabel('deviceLabel', { id: alert.deviceId });
            const canAcknowledge = alert.status === 'open';

            return (
              <div
                key={alert.id}
                className={styles.row}
                style={{ borderInlineStartColor: SEVERITY_COLORS[alert.severity] }}
              >
                <div className={styles.rowMain}>
                  <div className={styles.rowHeading}>
                    <span className={styles.rowTitle}>
                      {t(`messages.${messageKey}.title`, { device: deviceLabel })}
                    </span>
                    <span className={styles.pill} style={{ color: SEVERITY_COLORS[alert.severity] }}>
                      {t(`severity.${alert.severity}`)}
                    </span>
                    <span className={styles.pillOutline}>{t(`type.${messageKey}`)}</span>
                  </div>
                  <p className={styles.rowDetail}>{t(`messages.${messageKey}.detail`)}</p>
                  {ackErrorId === alert.id && <p className={styles.rowError}>{t('ackError')}</p>}
                </div>

                <div className={styles.rowMeta}>
                  <time dateTime={alert.openedAt} className={styles.rowTime}>
                    {formatOpenedAt(alert.openedAt)}
                  </time>
                  <span className={styles.rowStatus} style={{ color: STATUS_COLORS[alert.status] }}>
                    {t(`tabs.${alert.status}`)}
                  </span>
                </div>

                {canAcknowledge && (
                  <button
                    type="button"
                    className={styles.ackButton}
                    disabled={ackingId === alert.id}
                    onClick={() => handleAcknowledge(alert.id)}
                  >
                    {ackingId === alert.id ? t('ackingLabel') : t('ackButton')}
                  </button>
                )}
              </div>
            );
          })}

          {visibleAlerts.length === 0 && <p className={styles.empty}>{t('emptyState')}</p>}
        </div>
      )}

      <p className={styles.footerNote}>{t('footerNote')}</p>
    </main>
  );
}
