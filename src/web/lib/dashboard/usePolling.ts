'use client';

import { useEffect, useState } from 'react';

export interface PollingState {
  /** Number of interval ticks that have elapsed since mount (0 until the first tick fires). */
  tickCount: number;
  /** Wall-clock ms timestamp of the most recent tick (mount time until the first tick fires). */
  lastUpdatedAt: number;
}

/**
 * Drives the dashboard's periodic refresh (Issue #18 acceptance criteria:
 * "30秒間隔のポーリングで画面が更新される", default taken from the app-ui
 * dc-script's `pollingSeconds` prop default of 30s). Callers re-run their own
 * data fetch/derivation whenever `tickCount` changes (see SitesOverview /
 * DeviceDetailView), keeping this hook itself free of any fetch logic.
 */
export function usePolling(intervalMs: number): PollingState {
  const [tickCount, setTickCount] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTickCount((count) => count + 1);
      setLastUpdatedAt(Date.now());
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [intervalMs]);

  return { tickCount, lastUpdatedAt };
}

export const DEFAULT_POLLING_INTERVAL_MS = 30_000;
