import { describe, expect, it } from '@jest/globals';
import { formatNaira, isKobo, nairaToKobo, percentOfKobo, sumKobo } from '../../../../src/core/utils/money.js';

describe('money', () => {
  it('converts naira to integer kobo without float drift', () => {
    expect(nairaToKobo(3500)).toBe(350000);
    expect(nairaToKobo('1250.5')).toBe(125050);
    expect(nairaToKobo(0.1 + 0.2)).toBe(30);
    expect(nairaToKobo(19.99)).toBe(1999);
  });

  it('checks kobo values are safe integers', () => {
    expect(isKobo(350000)).toBe(true);
    expect(isKobo(0)).toBe(true);
    expect(isKobo(12.5)).toBe(false);
    expect(isKobo('350000')).toBe(false);
    expect(isKobo(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('takes percentages rounded to the kobo', () => {
    expect(percentOfKobo(100000, 1.5)).toBe(1500);
    expect(percentOfKobo(333333, 1.5)).toBe(5000);
    expect(percentOfKobo(350000, 70)).toBe(245000);
  });

  it('sums amounts', () => {
    expect(sumKobo([350000, 50000, 5250])).toBe(405250);
    expect(sumKobo([])).toBe(0);
  });

  it('formats naira for messages', () => {
    expect(formatNaira(850000)).toBe('₦8,500');
    expect(formatNaira(125050)).toBe('₦1,250.50');
    expect(formatNaira(0)).toBe('₦0');
  });
});
