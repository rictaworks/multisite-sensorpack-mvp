import { act, render, screen } from '@testing-library/react';
import { usePolling } from '../../lib/dashboard/usePolling';

function PollingProbe({ intervalMs }: { intervalMs: number }) {
  const { tickCount, lastUpdatedAt } = usePolling(intervalMs);
  return (
    <div>
      <span data-testid="tick-count">{tickCount}</span>
      <span data-testid="last-updated">{lastUpdatedAt}</span>
    </div>
  );
}

describe('usePolling (Issue #18 acceptance criteria: 30s-interval screen refresh)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts at tick 0 and does not fire before the interval elapses', () => {
    render(<PollingProbe intervalMs={30000} />);
    expect(screen.getByTestId('tick-count').textContent).toBe('0');

    act(() => {
      jest.advanceTimersByTime(29999);
    });
    expect(screen.getByTestId('tick-count').textContent).toBe('0');
  });

  it('increments the tick count once per configured interval (default 30s per app-ui dc-script)', () => {
    render(<PollingProbe intervalMs={30000} />);

    act(() => {
      jest.advanceTimersByTime(30000);
    });
    expect(screen.getByTestId('tick-count').textContent).toBe('1');

    act(() => {
      jest.advanceTimersByTime(60000);
    });
    expect(screen.getByTestId('tick-count').textContent).toBe('3');
  });

  it('clears the interval on unmount (no state updates / leaks after unmount)', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<PollingProbe intervalMs={30000} />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
