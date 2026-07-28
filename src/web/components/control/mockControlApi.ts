/**
 * Stub/mock client for the F5 dispatch_command flow (Issue #21).
 *
 * The real endpoint is `POST /devices/{deviceId}/commands` (see
 * `src/shared/contracts/openapi.yaml`, operationId `createCommand`). Per the
 * task instructions the backend is not implemented yet, so this module
 * simulates the same lifecycle the API contract documents:
 *
 *  - A command is created as `pending` with a 10 minute TTL
 *    (`expiresAt = issuedAt + 10min`, matching `Command.expiresAt`).
 *  - If the target device is online, the mock simulates the device
 *    acknowledging the command shortly after issuance: `pending` ->
 *    `delivered` -> `done`.
 *  - If the target device is offline, the command stays `pending` until the
 *    TTL elapses (reconnecting within the TTL is out of scope for this
 *    mock/stub — see Issue #21 follow-ups), at which point it is marked
 *    `expired` ("届きませんでした").
 *
 * No network call is made; state transitions are delivered to the caller via
 * the `onUpdate` callback so React state can be updated without polling.
 */
import type { Command, CommandTypeCode, DeviceStatus } from './types';

export const COMMAND_TTL_MS = 10 * 60 * 1000;

const ONLINE_DELIVERED_DELAY_MS = 400;
const ONLINE_DONE_DELAY_MS = 400;

export interface DispatchCommandOptions {
  /** Overridable for tests; defaults to the real 10 minute TTL. */
  ttlMs?: number;
  /** Overridable for tests; defaults to a short simulated ack delay. */
  deliveredDelayMs?: number;
  doneDelayMs?: number;
}

function assertValidDeviceId(deviceId: string): void {
  if (!deviceId) {
    throw new Error('dispatchCommand: deviceId must be a non-empty string');
  }
}

function assertValidCommandType(commandType: CommandTypeCode): void {
  const validTypes: CommandTypeCode[] = ['LED_ON', 'LED_OFF', 'FAN_ON', 'FAN_OFF'];
  if (!validTypes.includes(commandType)) {
    throw new Error(`dispatchCommand: unsupported commandType "${commandType}"`);
  }
}

/**
 * Issues a manual command against the mock command queue and schedules the
 * simulated lifecycle transitions. Returns the initial `pending` command
 * synchronously so the caller can render optimistic UI immediately.
 */
export function dispatchCommand(
  deviceId: string,
  commandType: CommandTypeCode,
  deviceStatus: DeviceStatus,
  onUpdate: (command: Command) => void,
  options: DispatchCommandOptions = {}
): Command {
  assertValidDeviceId(deviceId);
  assertValidCommandType(commandType);

  const ttlMs = options.ttlMs ?? COMMAND_TTL_MS;
  const deliveredDelayMs = options.deliveredDelayMs ?? ONLINE_DELIVERED_DELAY_MS;
  const doneDelayMs = options.doneDelayMs ?? ONLINE_DONE_DELAY_MS;

  const issuedAt = new Date();
  const idempotencyKey = crypto.randomUUID();
  const command: Command = {
    id: idempotencyKey,
    deviceId,
    commandType,
    idempotencyKey,
    origin: 'manual',
    status: 'pending',
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
  };

  // Debug trace for traceability (.claude/rules/coding-style.md); this project's
  // eslint config does not restrict console usage.
  console.debug('[control] dispatchCommand: issued', {
    deviceId,
    commandType,
    deviceStatus,
    idempotencyKey,
  });

  if (deviceStatus === 'online') {
    setTimeout(() => {
      const delivered: Command = { ...command, status: 'delivered' };
      console.debug('[control] dispatchCommand: delivered', { idempotencyKey });
      onUpdate(delivered);
      setTimeout(() => {
        const done: Command = { ...command, status: 'done' };
        console.debug('[control] dispatchCommand: done', { idempotencyKey });
        onUpdate(done);
      }, doneDelayMs);
    }, deliveredDelayMs);
  } else {
    setTimeout(() => {
      const expired: Command = { ...command, status: 'expired' };
      console.debug('[control] dispatchCommand: expired (TTL exceeded, offline)', {
        idempotencyKey,
      });
      onUpdate(expired);
    }, ttlMs);
  }

  return command;
}
