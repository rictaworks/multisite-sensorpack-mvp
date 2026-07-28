import { dispatchCommand } from '../../components/control/mockControlApi';

describe('mockControlApi.dispatchCommand', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a pending command synchronously, addressed to the requested device/type', () => {
    const onUpdate = jest.fn();
    const command = dispatchCommand('d1', 'LED_ON', 'online', onUpdate, {
      ttlMs: 1000,
      deliveredDelayMs: 100,
      doneDelayMs: 100,
    });

    expect(command.deviceId).toBe('d1');
    expect(command.commandType).toBe('LED_ON');
    expect(command.origin).toBe('manual');
    expect(command.status).toBe('pending');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('transitions pending -> delivered -> done for an online device', () => {
    const onUpdate = jest.fn();
    dispatchCommand('d1', 'FAN_ON', 'online', onUpdate, {
      ttlMs: 1000,
      deliveredDelayMs: 100,
      doneDelayMs: 100,
    });

    jest.advanceTimersByTime(100);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].status).toBe('delivered');

    jest.advanceTimersByTime(100);
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate.mock.calls[1][0].status).toBe('done');
  });

  it('stays pending, then expires once the TTL elapses, for an offline device (never reaches delivered/done)', () => {
    const onUpdate = jest.fn();
    dispatchCommand('d2', 'LED_OFF', 'offline', onUpdate, {
      ttlMs: 500,
      deliveredDelayMs: 100,
      doneDelayMs: 100,
    });

    jest.advanceTimersByTime(100);
    expect(onUpdate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(400);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].status).toBe('expired');
  });

  it('rejects an empty deviceId instead of silently issuing a command (fail fast, no fallback)', () => {
    expect(() => dispatchCommand('', 'LED_ON', 'online', jest.fn())).toThrow();
  });

  it('rejects an unsupported commandType instead of silently issuing a command (fail fast, no fallback)', () => {
    expect(() =>
      // @ts-expect-error deliberately invalid to exercise the validation guard
      dispatchCommand('d1', 'HEATER_ON', 'online', jest.fn())
    ).toThrow();
  });
});
