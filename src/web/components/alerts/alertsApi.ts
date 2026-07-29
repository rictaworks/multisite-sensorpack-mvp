import { ApiError, requestJson } from '../../lib/api/apiClient';
import type { components } from '../../../shared/contracts/types/api';

/**
 * F8 アラートのAPIクライアント — openapi.yaml `listAlerts` / `acknowledgeAlert`。
 *
 * かつては components/alerts/alertsRepository.ts のインメモリのモックだったが、
 * Rails側のアラートAPIは Issue #15 で実装済みであり、モックを残す理由が無くなったため
 * 実APIへ置き換えた。
 *
 * 形状は生成済みのOpenAPI型から取り、ここで再定義しない（CONTRACT.md）。
 */

export type Alert = components['schemas']['Alert'];
export type AlertStatus = components['schemas']['AlertStatus'];
export type AlertSeverity = components['schemas']['AlertSeverity'];
export type AlertTypeCode = components['schemas']['AlertTypeCode'];

/** 画面のタブと同じ3状態。既定の `listAlerts` は closed を含まないため明示的に要求する。 */
export const ALL_ALERT_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'closed'];

/**
 * ack できないアラートに対して ack を試みたときに送出する。
 *
 * requirements.md F8.2: ユーザーが ack できるのは open のみ。closed は閾値回復や
 * デバイス復帰による自動遷移でしか到達せず、手動操作の対象ではない。
 * サーバー側の 404 / 409 をこの型に翻訳し、呼び出し側が理由を区別できるようにする。
 */
export class AlertNotAcknowledgeableError extends Error {
  readonly reason: 'not_found' | 'not_open';

  constructor(alertId: number, reason: 'not_found' | 'not_open') {
    super(
      reason === 'not_found'
        ? `Alert ${alertId} was not found.`
        : `Alert ${alertId} is not open and cannot be acknowledged.`
    );
    this.name = 'AlertNotAcknowledgeableError';
    this.reason = reason;
  }
}

type ListAlertsResponse = { alerts: Alert[] };

/**
 * GET /alerts — 自分の拠点配下のアラート一覧。
 *
 * 画面は open / acknowledged / closed の3タブを持つが、APIの既定は closed を返さないため、
 * 3状態を明示して1回で取得する（タブごとに引くとタブ切り替えのたびに通信が発生する）。
 */
export async function listAlerts(
  statuses: AlertStatus[] = ALL_ALERT_STATUSES,
  fetchImpl: typeof fetch = fetch
): Promise<Alert[]> {
  const body = await requestJson<ListAlertsResponse>({
    path: `/alerts?status=${statuses.join(',')}`,
    method: 'GET',
    context: 'alertsApi#listAlerts',
    fetchImpl,
  });
  return body.alerts;
}

/**
 * POST /alerts/{alertId}/ack — アラートを確認ずみにする。
 *
 * 更新後のアラートをサーバーの応答から受け取り、画面側で状態を組み立て直さない
 * （組み立て直すと、サーバーが実際に何を保存したかと画面の表示がずれうる）。
 */
export async function acknowledgeAlert(
  alertId: number,
  fetchImpl: typeof fetch = fetch
): Promise<Alert> {
  try {
    return await requestJson<Alert>({
      path: `/alerts/${alertId}/ack`,
      method: 'POST',
      context: 'alertsApi#acknowledgeAlert',
      fetchImpl,
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'not_found') {
      throw new AlertNotAcknowledgeableError(alertId, 'not_found');
    }
    // 409: 既に closed のアラートは ack できない（手動 close 不可のため、
    // closed になっているということは自動で解決済みということ）。
    if (error instanceof ApiError && error.code === 'conflict') {
      throw new AlertNotAcknowledgeableError(alertId, 'not_open');
    }
    throw error;
  }
}
