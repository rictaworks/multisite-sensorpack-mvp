'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import DeviceControlCard from './DeviceControlCard';
import { dispatchCommand, fetchControlDevices, updateAutomationRule } from './controlApi';
import { usePolling, DEFAULT_POLLING_INTERVAL_MS } from '../../lib/dashboard/usePolling';
import styles from './control.module.css';
import type { ActuatorKind, CommandTypeCode, ControlDevice } from './types';

/**
 * F5 遠隔手動制御（運用ツール）画面 — Issue #21。
 *
 * データは実API（`GET /devices`・`/devices/{id}/commands`・`/devices/{id}/automation-rule`、
 * `POST /devices/{id}/commands`、`PUT /devices/{id}/automation-rule`）から取得する。
 * かつての components/control/mockControlApi.ts（pending→delivered→done をタイマーで
 * 擬似再現するモック）は撤去した。
 *
 * 実際の状態遷移はデバイスがテレメトリ送信時にACKすることで進むため（ピギーバック方式）、
 * 画面はポーリングで観測する。届いていないコマンドを届いたと表示しない。
 */

type ControlState =
  | { status: 'loading' }
  | { status: 'ready'; devices: ControlDevice[] }
  // 取得できていないことを「デバイス0台」と同じ見た目にしない。
  // 同じにすると、ユーザーは機器が消えたと誤解する。
  | { status: 'error' };

const CLOCK_TICK_MS = 1000;

function commandTypeFor(kind: ActuatorKind, nextOn: boolean): CommandTypeCode {
  if (kind === 'led') {
    return nextOn ? 'LED_ON' : 'LED_OFF';
  }
  return nextOn ? 'FAN_ON' : 'FAN_OFF';
}

export default function ControlView() {
  const t = useTranslations('control');

  const [state, setState] = useState<ControlState>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  // `now` はレンダー中ではなく効果内でサンプリングする。コンポーネントを純粋に保つため
  // （React の react-hooks/purity ルール）、手動オーバーライドの残り時間表示に使う
  // 「現在時刻」はpropsで配る。
  const [now, setNow] = useState<number | null>(null);

  const { tickCount } = usePolling(DEFAULT_POLLING_INTERVAL_MS);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchControlDevices()
      .then((devices) => {
        if (cancelled) return;
        setState({ status: 'ready', devices });
      })
      .catch((error: unknown) => {
        console.error('[ControlView] failed to load devices', error);
        if (cancelled) return;
        // 既に表示できている内容があるなら消さない（一度の通信失敗で操作面を奪わない）。
        setState((current) => (current.status === 'ready' ? current : { status: 'error' }));
      });

    return () => {
      cancelled = true;
    };
  }, [tickCount]);

  /** 発行・設定変更のあとにサーバーの現在値で組み直す（画面側で先回りして作らない）。 */
  const reload = useCallback(async () => {
    try {
      const devices = await fetchControlDevices();
      setState({ status: 'ready', devices });
    } catch (error) {
      console.error('[ControlView] failed to refresh devices', error);
      setActionError(t('errors.refreshFailed'));
    }
  }, [t]);

  const handleToggleConfirmed = useCallback(
    async (deviceId: number, kind: ActuatorKind, nextOn: boolean) => {
      setActionError(null);
      try {
        await dispatchCommand(deviceId, commandTypeFor(kind, nextOn));
        await reload();
      } catch (error) {
        // 失敗したのにトグルだけ切り替わると「送った」と誤解する。状態は動かさず理由を伝える。
        console.error('[ControlView] failed to dispatch command', { deviceId, kind, nextOn, error });
        setActionError(t('errors.dispatchFailed'));
      }
    },
    [reload, t]
  );

  const handleAutomationToggle = useCallback(
    async (deviceId: number, key: 'fanOnTempAlert' | 'ledOnAlert', value: boolean) => {
      setActionError(null);
      try {
        await updateAutomationRule(deviceId, { [key]: value });
        await reload();
      } catch (error) {
        console.error('[ControlView] failed to update automation rule', { deviceId, key, value, error });
        setActionError(t('errors.automationFailed'));
      }
    },
    [reload, t]
  );

  const devices = state.status === 'ready' ? state.devices : [];

  return (
    <main className={styles.page}>
      <div className={styles.eyebrow}>{t('eyebrow')}</div>
      <h1 className={styles.title}>{t('title')}</h1>
      <div className={styles.titleRule} />

      {state.status === 'loading' && <p>{t('loading')}</p>}
      {state.status === 'error' && <p role="alert">{t('errors.loadFailed')}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      {state.status === 'ready' && devices.length === 0 && <p className={styles.noDevices}>{t('noDevices')}</p>}

      {state.status === 'ready' && devices.length > 0 && (
        <div className={styles.deviceList}>
          {devices.map((device) => (
            <DeviceControlCard
              key={device.id}
              device={device}
              now={now}
              onToggleConfirmed={handleToggleConfirmed}
              onAutomationToggle={handleAutomationToggle}
            />
          ))}
        </div>
      )}
    </main>
  );
}
