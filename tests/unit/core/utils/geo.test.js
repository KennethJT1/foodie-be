import { describe, expect, it } from '@jest/globals';
import { haversineM } from '../../../../src/core/utils/geo.js';

describe('haversineM', () => {
  it('is 0 for the same point', () => {
    expect(haversineM({ lat: 6.5095, lng: 3.3711 }, { lat: 6.5095, lng: 3.3711 })).toBe(0);
  });

  it('measures Yaba → Victoria Island (about 10 km)', () => {
    const yaba = { lat: 6.5095, lng: 3.3711 };
    const vi = { lat: 6.4281, lng: 3.4219 };
    const metres = haversineM(yaba, vi);
    expect(metres).toBeGreaterThan(10_500);
    expect(metres).toBeLessThan(10_700);
    expect(haversineM(vi, yaba)).toBe(metres);
  });

  it('returns whole metres', () => {
    expect(Number.isInteger(haversineM({ lat: 6.5158, lng: 3.3794 }, { lat: 6.5122, lng: 3.3801 }))).toBe(true);
  });
});
