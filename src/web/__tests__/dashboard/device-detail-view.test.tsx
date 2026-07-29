import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import DeviceDetailView from '../../components/dashboard/DeviceDetailView';
import { ApiError } from '../../lib/api/apiClient';
import ja from '../../locales/ja.json';

/**
 * F6.3 デバイス詳細。実API(`GET /devices/{id}` / `/telemetry-series` / `/commands` /
 * `/alerts`)へ結線している。かつては lib/dashboard/mockData.ts のスタブを直接読んでいた。
 */
jest.mock('../../lib/dashboard/dashboardApi', () => ({
  __esModule: true,
  fetchDeviceDetail: jest.fn(),
  fetchCommands: jest.fn(),
  fetchAlerts: jest.fn(),
  fetchSitesSummary: jest.fn(),
  fetchTelemetrySeries: jest.fn(),
}));

import {
  fetchAlerts,
  fetchCommands,
  fetchDeviceDetail,
  fetchSitesSummary,
  fetchTelemetrySeries,
} from '../../lib/dashboard/dashboardApi';

const mockedDetail = fetchDeviceDetail as jest.Mock;
const mockedCommands = fetchCommands as jest.Mock;
const mockedAlerts = fetchAlerts as jest.Mock;
const mockedSites = fetchSitesSummary as jest.Mock;
const mockedSeries = fetchTelemetrySeries as jest.Mock;

const DEVICE_ID = 11;

function deviceDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: DEVICE_ID,
    siteId: 1,
    status: 'online',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    expectedIntervalSec: 60,
    createdAt: '2026-01-01T00:00:00.000Z',
    thresholds: [],
    automationRule: null,
    ...overrides,
  };
}

const COMMANDS = [
  {
    id: 5,
    deviceId: DEVICE_ID,
    commandType: 'LED_ON',
    origin: 'manual',
    status: 'done',
    issuedAt: '2026-01-01T00:10:00.000Z',
    expiresAt: '2026-01-01T00:20:00.000Z',
  },
  {
    id: 4,
    deviceId: DEVICE_ID,
    commandType: 'FAN_OFF',
    origin: 'manual',
    status: 'expired',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-01T00:10:00.000Z',
  },
];

const ALERTS = [
  {
    id: 9,
    deviceId: DEVICE_ID,
    alertType: 'upper_breach',
    severity: 'warning',
    status: 'open',
    openedAt: '2026-01-01T00:05:00.000Z',
    closedAt: null,
  },
];

const SERIES = {
  points: [
    { timestamp: '2026-01-01T00:00:00.000Z', temperatureC: 22.5, humidityPct: null, isAggregated: false },
    { timestamp: '2026-01-01T00:10:00.000Z', temperatureC: 23.5, humidityPct: null, isAggregated: false },
  ],
  thresholds: [],
};

const HUMIDITY_SERIES = {
  points: [
    { timestamp: '2026-01-01T00:00:00.000Z', temperatureC: null, humidityPct: 55, isAggregated: false },
    { timestamp: '2026-01-01T00:10:00.000Z', temperatureC: null, humidityPct: 56, isAggregated: false },
  ],
  thresholds: [],
};

function renderDetail(deviceId: number = DEVICE_ID) {
  return render(
    <NextIntlClientProvider locale="ja" messages={ja}>
      <DeviceDetailView deviceId={deviceId} />
    </NextIntlClientProvider>
  );
}

describe('DeviceDetailView (Issue #18 受け入れ条件: 24h/7d グラフ・閾値ライン・コマンド/アラート履歴)', () => {
  beforeEach(() => {
    [mockedDetail, mockedCommands, mockedAlerts, mockedSites, mockedSeries].forEach((mock) => mock.mockReset());
    mockedDetail.mockResolvedValue(deviceDetail());
    mockedCommands.mockResolvedValue(COMMANDS);
    mockedAlerts.mockResolvedValue(ALERTS);
    mockedSites.mockResolvedValue([{ id: 1, name: '倉庫A', deviceCount: 1, onlineDeviceCount: 1, openAlertCount: 0, createdAt: '2026-01-01T00:00:00.000Z' }]);
    mockedSeries.mockImplementation((_deviceId: number, _range: string, sensorType: string) =>
      Promise.resolve(sensorType === 'humidity' ? HUMIDITY_SERIES : SERIES)
    );
  });

  it('デバイス名・状態・所属拠点名を表示する', async () => {
    renderDetail();

    expect(
      await screen.findByText(ja.dashboard.overview.deviceLabel.replace('{id}', String(DEVICE_ID)))
    ).toBeInTheDocument();
    expect(screen.getByText(ja.dashboard.device.statusOnline)).toBeInTheDocument();
    expect(screen.getByText('倉庫A')).toBeInTheDocument();
  });

  it('既定は24時間で、7日間に切り替えるとその範囲で再取得する', async () => {
    renderDetail();

    const range24h = await screen.findByRole('button', { name: ja.dashboard.device.range24h });
    const range7d = screen.getByRole('button', { name: ja.dashboard.device.range7d });
    expect(range24h).toHaveAttribute('aria-pressed', 'true');
    expect(mockedSeries).toHaveBeenCalledWith(DEVICE_ID, '24h', 'temperature');

    fireEvent.click(range7d);

    await waitFor(() => expect(mockedSeries).toHaveBeenCalledWith(DEVICE_ID, '7d', 'temperature'));
    expect(range7d).toHaveAttribute('aria-pressed', 'true');
    expect(range24h).toHaveAttribute('aria-pressed', 'false');
  });

  it('温度と湿度をそれぞれ取得してグラフに描画する', async () => {
    renderDetail();

    expect(await screen.findByText(ja.dashboard.device.legendTemperature)).toBeInTheDocument();
    expect(mockedSeries).toHaveBeenCalledWith(DEVICE_ID, '24h', 'temperature');
    expect(mockedSeries).toHaveBeenCalledWith(DEVICE_ID, '24h', 'humidity');
  });

  it('オフラインのデバイスにだけ警告を表示する', async () => {
    mockedDetail.mockResolvedValue(deviceDetail({ status: 'offline' }));

    renderDetail();

    expect(await screen.findByText(ja.dashboard.device.offlineWarning)).toBeInTheDocument();
  });

  it('オンラインのデバイスには警告を表示しない', async () => {
    renderDetail();

    await screen.findByText(ja.dashboard.device.statusOnline);
    expect(screen.queryByText(ja.dashboard.device.offlineWarning)).not.toBeInTheDocument();
  });

  it('コマンド履歴を、種別と状態を翻訳して表示する', async () => {
    renderDetail();

    const list = await screen.findByTestId('command-history');
    const rows = within(list).getAllByTestId('command-row');
    expect(rows).toHaveLength(COMMANDS.length);
    expect(within(rows[0]).getByText(ja.dashboard.commandType.LED_ON)).toBeInTheDocument();
    expect(within(rows[0]).getByText(ja.dashboard.commandStatus.done)).toBeInTheDocument();
  });

  it('アラート履歴を、種別と状態を翻訳して表示する', async () => {
    renderDetail();

    const list = await screen.findByTestId('alert-history');
    const rows = within(list).getAllByTestId('alert-row');
    expect(rows).toHaveLength(ALERTS.length);
    expect(within(rows[0]).getByText(ja.dashboard.alertType.upper_breach)).toBeInTheDocument();
    expect(within(rows[0]).getByText(ja.dashboard.alertStatus.open)).toBeInTheDocument();
  });

  it('履歴が空でもクラッシュせず、件数0の案内を表示する', async () => {
    mockedCommands.mockResolvedValue([]);
    mockedAlerts.mockResolvedValue([]);

    renderDetail();

    expect(await screen.findByText(ja.dashboard.device.noCommands)).toBeInTheDocument();
    expect(screen.getByText(ja.dashboard.device.noAlerts)).toBeInTheDocument();
  });

  // 「見つからない」と「通信できなかった」は別の状況であり、同じ表示にしない。
  it('存在しないデバイス(404)には見つからない旨を表示する', async () => {
    mockedDetail.mockRejectedValue(new ApiError(404, 'not_found', 'not found'));

    renderDetail(-1);

    expect(await screen.findByText(ja.dashboard.device.notFound)).toBeInTheDocument();
    expect(screen.queryByText(ja.dashboard.device.loadError)).not.toBeInTheDocument();
  });

  it('他ユーザーのデバイス(403)も見つからない旨に丸め、存在を推測させない', async () => {
    mockedDetail.mockRejectedValue(new ApiError(403, 'forbidden', 'forbidden'));

    renderDetail();

    expect(await screen.findByText(ja.dashboard.device.notFound)).toBeInTheDocument();
  });

  it('通信に失敗した場合は再試行を促すエラーを表示する', async () => {
    mockedDetail.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent(ja.dashboard.device.loadError);
    expect(screen.queryByText(ja.dashboard.device.notFound)).not.toBeInTheDocument();
  });

  it('取得中は読み込み中を表示する', () => {
    mockedDetail.mockReturnValue(new Promise(() => {}));

    renderDetail();

    expect(screen.getByText(ja.dashboard.device.loading)).toBeInTheDocument();
  });
});
