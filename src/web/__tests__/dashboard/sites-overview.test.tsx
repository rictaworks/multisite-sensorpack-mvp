import { render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import SitesOverview from '../../components/dashboard/SitesOverview';
import { ApiError } from '../../lib/api/apiClient';
import ja from '../../locales/ja.json';
import en from '../../locales/en.json';

/**
 * F6.2 拠点一覧。実API(`GET /dashboard/sites-summary` と `GET /devices`)へ結線している。
 * かつては lib/dashboard/mockData.ts のスタブを直接読んでいたが、参照系のRails APIが
 * 実装済みになったため撤去した。
 */
jest.mock('../../lib/dashboard/dashboardApi', () => ({
  __esModule: true,
  fetchSitesSummary: jest.fn(),
  fetchDevices: jest.fn(),
}));

import { fetchDevices, fetchSitesSummary } from '../../lib/dashboard/dashboardApi';

const mockedFetchSitesSummary = fetchSitesSummary as jest.Mock;
const mockedFetchDevices = fetchDevices as jest.Mock;

const SITES = [
  {
    id: 1,
    name: '倉庫A',
    deviceCount: 2,
    onlineDeviceCount: 1,
    openAlertCount: 1,
    latestTemperatureC: 23.4,
    latestHumidityPct: 55,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: '実家',
    deviceCount: 1,
    onlineDeviceCount: 1,
    openAlertCount: 0,
    latestTemperatureC: null,
    latestHumidityPct: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const DEVICES = [
  { id: 11, siteId: 1, status: 'online', lastSeenAt: '2026-01-01T00:00:00.000Z', expectedIntervalSec: 60, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 12, siteId: 1, status: 'offline', lastSeenAt: '2026-01-01T00:00:00.000Z', expectedIntervalSec: 60, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 21, siteId: 2, status: 'online', lastSeenAt: null, expectedIntervalSec: 60, createdAt: '2026-01-01T00:00:00.000Z' },
];

function renderOverview(messages: typeof ja = ja, locale = 'ja') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SitesOverview />
    </NextIntlClientProvider>
  );
}

describe('SitesOverview (Issue #18 受け入れ条件: 拠点ごとのデバイス数・オンライン数・アラート数と最新値)', () => {
  beforeEach(() => {
    mockedFetchSitesSummary.mockReset();
    mockedFetchDevices.mockReset();
    mockedFetchSitesSummary.mockResolvedValue(SITES);
    mockedFetchDevices.mockResolvedValue(DEVICES);
  });

  it('APIから取得した拠点の集計を見出しとともに表示する', async () => {
    renderOverview();

    expect(await screen.findByTestId('stat-sites-value')).toHaveTextContent('2');
    expect(screen.getByRole('heading', { name: ja.dashboard.overview.title })).toBeInTheDocument();
    expect(screen.getByTestId('stat-devices-value')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-online-value')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-open-alerts-value')).toHaveTextContent('1');
  });

  it('拠点ごとにカードを描画し、その拠点のデバイスだけを並べる', async () => {
    renderOverview();

    const cardA = await screen.findByTestId('site-card-1');
    expect(within(cardA).getByText('倉庫A')).toBeInTheDocument();
    expect(within(cardA).getByText(ja.dashboard.overview.deviceLabel.replace('{id}', '11'))).toBeInTheDocument();
    expect(within(cardA).getByText(ja.dashboard.overview.deviceLabel.replace('{id}', '12'))).toBeInTheDocument();
    // 別拠点のデバイスが混ざらないこと。
    expect(within(cardA).queryByText(ja.dashboard.overview.deviceLabel.replace('{id}', '21'))).not.toBeInTheDocument();
  });

  it('各デバイス行がデバイス詳細ページへのリンクになっている', async () => {
    renderOverview();

    const link = await screen.findByRole('link', {
      name: new RegExp(ja.dashboard.overview.deviceLabel.replace('{id}', '11')),
    });
    expect(link).toHaveAttribute('href', expect.stringContaining('/dashboard/11'));
  });

  // 拠点数ぶんリクエストが増える(N+1)のを避け、デバイスは一度にまとめて取得する。
  it('デバイス一覧を拠点ごとに引かず、1回だけ取得する', async () => {
    renderOverview();

    await screen.findByTestId('site-card-1');

    expect(mockedFetchDevices).toHaveBeenCalledTimes(1);
    expect(mockedFetchDevices).toHaveBeenCalledWith();
  });

  it('最新の計測値が無い拠点は「データなし」と表示する(0と誤解させない)', async () => {
    renderOverview();

    const cardB = await screen.findByTestId('site-card-2');
    expect(within(cardB).getAllByText(ja.dashboard.overview.noReading)).toHaveLength(2);
  });

  it('取得中は読み込み中を表示する', () => {
    mockedFetchSitesSummary.mockReturnValue(new Promise(() => {}));
    mockedFetchDevices.mockReturnValue(new Promise(() => {}));

    renderOverview();

    expect(screen.getByText(ja.dashboard.overview.loading)).toBeInTheDocument();
  });

  // 取得失敗を「拠点0件」と同じ見た目にすると、ユーザーは拠点が消えたと誤解する。
  it('取得に失敗したらエラーを表示し、0件の案内とは区別する', async () => {
    mockedFetchSitesSummary.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));
    mockedFetchDevices.mockRejectedValue(new ApiError(0, 'network_error', 'network_error'));

    renderOverview();

    expect(await screen.findByRole('alert')).toHaveTextContent(ja.dashboard.overview.loadError);
    expect(screen.queryByText(ja.dashboard.overview.emptySites)).not.toBeInTheDocument();
  });

  it('拠点が0件のときは0件の案内を表示する(エラーにしない)', async () => {
    mockedFetchSitesSummary.mockResolvedValue([]);
    mockedFetchDevices.mockResolvedValue([]);

    renderOverview();

    expect(await screen.findByText(ja.dashboard.overview.emptySites)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('英語ロケールでは表示文言が切り替わる', async () => {
    renderOverview(en as typeof ja, 'en');

    expect(await screen.findByRole('heading', { name: en.dashboard.overview.title })).toBeInTheDocument();
    expect(screen.queryByText(ja.dashboard.overview.title)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('stat-sites-value')).toHaveTextContent('2'));
  });
});
