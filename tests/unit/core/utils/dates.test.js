import { describe, expect, it } from '@jest/globals';
import { addDays, isLagosDay, lagosDay, lagosDayEnd, lagosDayStart } from '../../../../src/core/utils/dates.js';

describe('Lagos days (UTC+1)', () => {
  it('buckets a UTC time into its Lagos day', () => {
    expect(lagosDay('2026-10-28T14:05:00.000Z')).toBe('2026-10-28');
    expect(lagosDay('2026-10-28T22:59:59.999Z')).toBe('2026-10-28');
    expect(lagosDay('2026-10-28T23:00:00.000Z')).toBe('2026-10-29');
    expect(lagosDay(new Date('2026-12-31T23:30:00.000Z'))).toBe('2027-01-01');
  });

  it('gives the UTC range of a Lagos day', () => {
    expect(lagosDayStart('2026-10-28').toISOString()).toBe('2026-10-27T23:00:00.000Z');
    expect(lagosDayEnd('2026-10-28').toISOString()).toBe('2026-10-28T22:59:59.999Z');
  });

  it('round-trips: start and end of a day fall on that day', () => {
    expect(lagosDay(lagosDayStart('2026-03-01'))).toBe('2026-03-01');
    expect(lagosDay(lagosDayEnd('2026-03-01'))).toBe('2026-03-01');
  });

  it('validates YYYY-MM-DD', () => {
    expect(isLagosDay('2026-10-28')).toBe(true);
    expect(isLagosDay('2026-02-30')).toBe(false);
    expect(isLagosDay('2026-10-28T00:00')).toBe(false);
    expect(isLagosDay(undefined)).toBe(false);
    expect(() => lagosDayStart('yesterday')).toThrow();
  });

  it('shifts days across month and year ends', () => {
    expect(addDays('2026-10-28', 4)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
