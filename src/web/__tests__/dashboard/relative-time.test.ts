import { describeElapsed } from '../../lib/dashboard/relativeTime';

describe('describeElapsed (device "last seen" / alert age formatting)', () => {
  const now = new Date('2026-07-28T12:00:00.000Z').getTime();

  it('classifies sub-minute gaps as "justNow"', () => {
    expect(describeElapsed(now, now - 30 * 1000)).toEqual({ unit: 'justNow', value: 0 });
  });

  it('classifies minute-scale gaps', () => {
    expect(describeElapsed(now, now - 5 * 60 * 1000)).toEqual({ unit: 'minutes', value: 5 });
  });

  it('classifies hour-scale gaps', () => {
    expect(describeElapsed(now, now - 3 * 60 * 60 * 1000)).toEqual({ unit: 'hours', value: 3 });
  });

  it('classifies day-scale gaps', () => {
    expect(describeElapsed(now, now - 2 * 24 * 60 * 60 * 1000)).toEqual({ unit: 'days', value: 2 });
  });

  it('never returns a negative value even for future timestamps (fail-fast callers should not see NaN/negatives)', () => {
    const result = describeElapsed(now, now + 1000);
    expect(result.value).toBeGreaterThanOrEqual(0);
  });
});
