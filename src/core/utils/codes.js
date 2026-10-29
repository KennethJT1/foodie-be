import { randomInt } from 'node:crypto';

// Uppercase letters and digits without look-alikes (0/O, 1/I/L), since people read codes aloud
const ORDER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 6-character order code (`4F7Q2A`); the UI prints it as `KJT-4F7Q2A`. */
export const orderCode = () =>
  Array.from({ length: 6 }, () => ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)]).join('');

/** 4-digit delivery code the customer gives the rider (shown only to the customer and admins). */
export const deliveryCode = () => String(randomInt(10_000)).padStart(4, '0');

/**
 * Generates codes until `isTaken(code)` is false. Collisions are rare, so a handful of tries is
 * plenty; running out means something is wrong (e.g. `isTaken` always true).
 */
export const uniqueCode = async (generate, isTaken, attempts = 10) => {
  for (let i = 0; i < attempts; i += 1) {
    const code = generate();
    if (!(await isTaken(code))) return code;
  }
  throw new Error(`No free code after ${attempts} attempts`);
};
