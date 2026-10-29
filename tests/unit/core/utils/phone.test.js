import { describe, expect, it } from '@jest/globals';
import { normalisePhone } from '../../../../src/core/utils/phone.js';

describe('normalisePhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['0803-123-4567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['07061234567', '+2347061234567'],
    ['09051234567', '+2349051234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each([null, undefined, '', '0803123456', '080312345678', '01234567890', '+447911123456', 'phone'])(
    'rejects %p',
    (input) => {
      expect(normalisePhone(input)).toBeNull();
    },
  );
});
