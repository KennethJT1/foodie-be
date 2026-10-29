import { describe, expect, it } from '@jest/globals';
import { deliveryCode, orderCode, uniqueCode } from '../../../../src/core/utils/codes.js';

describe('codes', () => {
  it('order codes are 6 uppercase letters/digits without look-alikes', () => {
    for (let i = 0; i < 500; i += 1) expect(orderCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it('delivery codes are 4 digits, leading zeros kept', () => {
    for (let i = 0; i < 500; i += 1) expect(deliveryCode()).toMatch(/^\d{4}$/);
  });

  it('uniqueCode retries until a code is free', async () => {
    const codes = ['AAAAAA', 'BBBBBB', 'CCCCCC'];
    const code = await uniqueCode(
      () => codes.shift(),
      async (c) => c !== 'CCCCCC',
    );
    expect(code).toBe('CCCCCC');
  });

  it('uniqueCode gives up after the attempts run out', async () => {
    await expect(uniqueCode(orderCode, async () => true, 3)).rejects.toThrow('No free code after 3 attempts');
  });
});
