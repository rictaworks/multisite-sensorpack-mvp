import type { components } from '@contracts/api';

/**
 * 運用ツール画面（Issue #21, requirements.md F5）で使う型。
 *
 * かつては「APIはモック/スタブでよい」という前提でここに同じ形を再宣言していたが、
 * 実APIへ結線したため、生成済みのOpenAPI型（src/shared/contracts/types/api.ts）を
 * 参照する。契約と実装の二重定義は、片方だけ変わったときに気付けない
 * （src/shared/contracts/CONTRACT.md「API形状をコンポーネント側で再定義しない」）。
 */

export type DeviceStatus = components['schemas']['DeviceStatus'];
export type CommandTypeCode = components['schemas']['CommandTypeCode'];
export type CommandOrigin = components['schemas']['CommandOrigin'];
export type CommandStatus = components['schemas']['CommandStatus'];
export type Command = components['schemas']['Command'];
export type AutomationRule = components['schemas']['AutomationRule'];

/** LED / ファンの2種類。契約のCommandTypeCodeから導かれる画面側の概念。 */
export type ActuatorKind = 'led' | 'fan';

/**
 * 1台ぶんの表示に必要な情報をまとめたもの。
 *
 * `siteName` は契約のDeviceに含まれないため拠点一覧から補完し、`ledOn`/`fanOn` は
 * 契約に現在状態のフィールドが無いため直近のコマンドから導出する
 * （controlApi.ts の isActuatorOn を参照）。いずれもこの画面の組み立て結果であって
 * APIのレスポンスそのものではないため、契約の型とは別に定義する。
 */
export interface ControlDevice {
  id: number;
  siteName: string;
  status: DeviceStatus;
  ledOn: boolean;
  fanOn: boolean;
  automationRule: AutomationRule;
  commands: Command[];
}
