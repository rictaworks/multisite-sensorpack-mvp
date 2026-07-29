import { requestJson } from '../../lib/api/apiClient';
import type {
  ActuatorKind,
  AutomationRule,
  Command,
  CommandTypeCode,
  ControlDevice,
  DeviceStatus,
} from './types';

/**
 * F5 遠隔手動制御（運用ツール画面）のAPIクライアント。
 *
 * かつては components/control/mockControlApi.ts が pending → delivered → done の遷移を
 * タイマーで擬似再現していたが、Rails側のコマンド発行APIは Issue #11 で実装済みであり、
 * 自動制御ルールAPIも実装したためモックを残す理由が無くなった。
 *
 * 実際の状態遷移はデバイスがテレメトリ送信時にACKすることで進むため（ピギーバック方式）、
 * 画面側はコマンド履歴をポーリングして観測する。擬似的に進めない。
 */

type DevicesResponse = { devices: Array<{ id: number; siteId: number; status: DeviceStatus }> };
type SitesResponse = { sites: Array<{ id: number; name: string }> };
type CommandsResponse = { commands: Command[] };

/** 画面に出すコマンド履歴の行数。多すぎるとカードが縦に伸びて操作部が押し出される。 */
const MAX_HISTORY_ROWS = 6;

/** アクチュエータ種別ごとの「ON」コマンド。状態の導出に使う。 */
const ON_COMMAND_BY_ACTUATOR: Record<ActuatorKind, CommandTypeCode> = {
  led: 'LED_ON',
  fan: 'FAN_ON',
};

function actuatorOf(commandType: CommandTypeCode): ActuatorKind {
  return commandType.startsWith('LED_') ? 'led' : 'fan';
}

/**
 * アクチュエータの現在のON/OFFを、そのアクチュエータ宛の最新コマンドから導出する。
 *
 * 契約（openapi.yaml）にアクチュエータの現在状態を持つフィールドは無い。実機の物理状態を
 * 知る手段が無い以上、「最後に発行され、失効していないコマンド」が画面として言える最大限で、
 * それ以上を装わない（.claude/rules/coding-style.md: 想定で値をでっち上げない）。
 * 失効した（expired）コマンドは届かなかったので、状態には反映しない。
 */
function isActuatorOn(commands: Command[], kind: ActuatorKind): boolean {
  const latest = commands
    .filter((command) => actuatorOf(command.commandType) === kind && command.status !== 'expired')
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0];

  return latest?.commandType === ON_COMMAND_BY_ACTUATOR[kind];
}

/**
 * 運用ツール画面が必要とするデバイス一覧を組み立てる。
 *
 * コマンド履歴と自動制御ルールはデバイス単位のエンドポイントしか契約に無いため、
 * デバイス台数ぶんのリクエストが発生する。requirements.md 1.8 の最小構成（デバイス2台）が
 * 前提のMVPでは許容できる。台数が増える場合は一括取得エンドポイントの追加が必要になる。
 */
export async function fetchControlDevices(fetchImpl: typeof fetch = fetch): Promise<ControlDevice[]> {
  const [devicesBody, sitesBody] = await Promise.all([
    requestJson<DevicesResponse>({
      path: '/devices',
      method: 'GET',
      context: 'controlApi#fetchControlDevices',
      fetchImpl,
    }),
    requestJson<SitesResponse>({
      path: '/dashboard/sites-summary',
      method: 'GET',
      context: 'controlApi#fetchControlDevices',
      fetchImpl,
    }),
  ]);

  const siteNameById = new Map(sitesBody.sites.map((site) => [site.id, site.name]));

  return Promise.all(
    devicesBody.devices.map(async (device) => {
      const [commandsBody, automationRule] = await Promise.all([
        requestJson<CommandsResponse>({
          path: `/devices/${device.id}/commands`,
          method: 'GET',
          context: 'controlApi#fetchControlDevices',
          fetchImpl,
        }),
        requestJson<AutomationRule>({
          path: `/devices/${device.id}/automation-rule`,
          method: 'GET',
          context: 'controlApi#fetchControlDevices',
          fetchImpl,
        }),
      ]);

      const commands = commandsBody.commands.slice(0, MAX_HISTORY_ROWS);

      return {
        id: device.id,
        siteName: siteNameById.get(device.siteId) ?? '',
        status: device.status,
        ledOn: isActuatorOn(commandsBody.commands, 'led'),
        fanOn: isActuatorOn(commandsBody.commands, 'fan'),
        automationRule,
        commands,
      };
    })
  );
}

/**
 * POST /devices/{deviceId}/commands — 手動コマンドを発行する。
 *
 * サーバーは pending 状態のコマンドを返す。delivered / done への遷移はデバイスの
 * ACK待ちであり、画面側で先回りして進めない（届いていないものを届いたと表示しないため）。
 */
export async function dispatchCommand(
  deviceId: number,
  commandType: CommandTypeCode,
  fetchImpl: typeof fetch = fetch
): Promise<Command> {
  return requestJson<Command>({
    path: `/devices/${deviceId}/commands`,
    method: 'POST',
    body: { commandType },
    context: 'controlApi#dispatchCommand',
    fetchImpl,
  });
}

/**
 * PUT /devices/{deviceId}/automation-rule — 自動制御ルールを更新する。
 * 変更したフィールドのみ送る（送らなかったフィールドはサーバー側で現在値が維持される）。
 */
export async function updateAutomationRule(
  deviceId: number,
  changes: Partial<Pick<AutomationRule, 'fanOnTempAlert' | 'ledOnAlert'>>,
  fetchImpl: typeof fetch = fetch
): Promise<AutomationRule> {
  return requestJson<AutomationRule>({
    path: `/devices/${deviceId}/automation-rule`,
    method: 'PUT',
    body: changes,
    context: 'controlApi#updateAutomationRule',
    fetchImpl,
  });
}

export { MAX_HISTORY_ROWS };
