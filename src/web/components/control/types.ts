/**
 * Local type definitions for the Operation Tools screen (Issue #21, requirements.md F5).
 *
 * These mirror the shapes defined in `src/shared/contracts/openapi.yaml`
 * (`DeviceStatus`, `CommandTypeCode`, `CommandOrigin`, `CommandStatus`, `Command`,
 * `AutomationRule`) and the generated `src/shared/contracts/types/api.ts`.
 *
 * `src/web` is not yet wired up as an npm workspace consumer of
 * `@sensorpack/contracts` (no root package.json/workspaces exists in this repo
 * yet), so per the task instructions ("APIはモック/スタブでよい") this module
 * re-declares the same field names/enums locally instead of importing across
 * packages. When the workspace wiring lands, these can be replaced by
 * `import type { components } from '@sensorpack/contracts/types/api'` without
 * changing any call sites, since the shapes are kept identical on purpose.
 */

export type DeviceStatus = 'provisioning' | 'online' | 'offline';

export type CommandTypeCode = 'LED_ON' | 'LED_OFF' | 'FAN_ON' | 'FAN_OFF';

export type CommandOrigin = 'manual' | 'auto';

export type CommandStatus = 'pending' | 'delivered' | 'done' | 'expired';

export type ActuatorKind = 'led' | 'fan';

export interface Command {
  id: string;
  deviceId: string;
  commandType: CommandTypeCode;
  idempotencyKey: string;
  origin: CommandOrigin;
  status: CommandStatus;
  issuedAt: string;
  /** issuedAt + 10 minutes, per openapi.yaml Command.expiresAt */
  expiresAt: string;
}

export interface AutomationRule {
  /** 温度上限アラートopenでFAN_ON、closeでFAN_OFFを自動発行する */
  fanOnTempAlert: boolean;
  /** アラートopen中の現地表示灯としてLEDを自動制御する */
  ledOnAlert: boolean;
  /** 手動コマンド発行後30分間、同一アクチュエータへの自動ルール発行を抑止する期限 */
  manualOverrideUntil: string | null;
}

export interface ControlDevice {
  id: string;
  siteName: string;
  name: string;
  status: DeviceStatus;
  ledOn: boolean;
  fanOn: boolean;
  automationRule: AutomationRule;
  commands: Command[];
}
