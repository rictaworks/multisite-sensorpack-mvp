import { requestJson } from '../api/apiClient';
import type { components } from '@contracts/api';

/**
 * F6 ダッシュボードのAPIクライアント。
 *
 * lib/dashboard/mockData.ts（契約と同じ形のスタブ）を置き換えるもの。スタブは
 * 「Rails APIとの実結線は後続issueの範囲」という前提で置かれていたが、
 * 参照系のエンドポイントは Issue #12 で実装済みであり、モックを残す理由が無くなった。
 *
 * リクエストはすべて同一オリジンの相対パス（`/api/v1/...`）へ送り、Next.jsの
 * サーバー側プロキシがRailsへ転送する（Issue #53 A-4）。
 * 形状は生成済みのOpenAPI型から取り、ここで再定義しない（CONTRACT.md）。
 */

export type Site = components['schemas']['Site'];
export type Device = components['schemas']['Device'];
export type DeviceDetail = components['schemas']['DeviceDetail'];
export type Threshold = components['schemas']['Threshold'];
export type Command = components['schemas']['Command'];
export type Alert = components['schemas']['Alert'];
export type TelemetrySeriesPoint = components['schemas']['TelemetrySeriesPoint'];
export type SensorTypeCode = components['schemas']['SensorTypeCode'];

export type TelemetryRange = '24h' | '7d';

export interface TelemetrySeriesResponse {
  points: TelemetrySeriesPoint[];
  thresholds: Threshold[];
}

type SitesSummaryResponse = { sites: Site[] };
type DevicesResponse = { devices: Device[] };
type CommandsResponse = { commands: Command[] };
type AlertsResponse = { alerts: Alert[] };

/** GET /dashboard/sites-summary — 拠点ごとの集計（F6.2）。 */
export async function fetchSitesSummary(fetchImpl: typeof fetch = fetch): Promise<Site[]> {
  const body = await requestJson<SitesSummaryResponse>({
    path: '/dashboard/sites-summary',
    method: 'GET',
    context: 'dashboardApi#fetchSitesSummary',
    fetchImpl,
  });
  return body.sites;
}

/**
 * GET /devices — 自分の拠点配下のデバイス一覧。
 *
 * 拠点カードごとに `?siteId=` で引くと拠点数ぶんリクエストが増える（N+1）ため、
 * 一覧画面では引数なしで一度に取得し、呼び出し側で siteId ごとに束ねる。
 */
export async function fetchDevices(
  siteId?: number,
  fetchImpl: typeof fetch = fetch
): Promise<Device[]> {
  const query = siteId === undefined ? '' : `?siteId=${encodeURIComponent(String(siteId))}`;
  const body = await requestJson<DevicesResponse>({
    path: `/devices${query}`,
    method: 'GET',
    context: 'dashboardApi#fetchDevices',
    fetchImpl,
  });
  return body.devices;
}

/** GET /devices/{deviceId} — デバイス詳細（閾値・自動制御ルールを含む）。 */
export async function fetchDeviceDetail(
  deviceId: number,
  fetchImpl: typeof fetch = fetch
): Promise<DeviceDetail> {
  return requestJson<DeviceDetail>({
    path: `/devices/${deviceId}`,
    method: 'GET',
    context: 'dashboardApi#fetchDeviceDetail',
    fetchImpl,
  });
}

/** GET /devices/{deviceId}/telemetry-series — グラフ用の時系列と閾値ライン（F6.3）。 */
export async function fetchTelemetrySeries(
  deviceId: number,
  range: TelemetryRange,
  sensorType: SensorTypeCode,
  fetchImpl: typeof fetch = fetch
): Promise<TelemetrySeriesResponse> {
  return requestJson<TelemetrySeriesResponse>({
    path: `/devices/${deviceId}/telemetry-series?range=${range}&sensorType=${sensorType}`,
    method: 'GET',
    context: 'dashboardApi#fetchTelemetrySeries',
    fetchImpl,
  });
}

/** GET /devices/{deviceId}/commands — コマンド履歴。 */
export async function fetchCommands(
  deviceId: number,
  fetchImpl: typeof fetch = fetch
): Promise<Command[]> {
  const body = await requestJson<CommandsResponse>({
    path: `/devices/${deviceId}/commands`,
    method: 'GET',
    context: 'dashboardApi#fetchCommands',
    fetchImpl,
  });
  return body.commands;
}

/** GET /alerts — アラート履歴。deviceId 指定でそのデバイスのぶんに絞る。 */
export async function fetchAlerts(
  deviceId?: number,
  fetchImpl: typeof fetch = fetch
): Promise<Alert[]> {
  const query = deviceId === undefined ? '' : `?deviceId=${encodeURIComponent(String(deviceId))}`;
  const body = await requestJson<AlertsResponse>({
    path: `/alerts${query}`,
    method: 'GET',
    context: 'dashboardApi#fetchAlerts',
    fetchImpl,
  });
  return body.alerts;
}
