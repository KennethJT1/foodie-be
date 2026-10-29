/**
 * Any Nigerian mobile format → E.164 `+2348031234567`, or null when it isn't one.
 * Accepts `08031234567`, `2348031234567`, `+234 803 123 4567`, `8031234567`.
 * Same rules as the frontend's `normalisePhone` (foodie-fe src/lib/format.js).
 */
export const normalisePhone = (phone) => {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, '');

  let national;
  if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 13 && digits.startsWith('234')) national = digits.slice(3);
  else if (digits.length === 10) national = digits;
  else return null;

  // Mobile numbers start with 7, 8 or 9; deliberately no stricter than the frontend's form check
  return /^[789]/.test(national) ? `+234${national}` : null;
};
