// Dates are stored in UTC. "Lagos days" (charts, sales by day, `from` / `to` filters) use
// Africa/Lagos, which is UTC+1 all year (no daylight saving).
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Date / ISO string → `YYYY-MM-DD` of the Lagos day it falls on. */
export const lagosDay = (date = new Date()) =>
  new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

export const isLagosDay = (value) => {
  if (!DAY_PATTERN.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** `YYYY-MM-DD` → first instant of that Lagos day, as a UTC Date (23:00 the day before). */
export const lagosDayStart = (day) => {
  if (!isLagosDay(day)) throw new Error(`Not a YYYY-MM-DD day: ${day}`);
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() - LAGOS_OFFSET_MS);
};

/** `YYYY-MM-DD` → last millisecond of that Lagos day, as a UTC Date (inclusive `to` filters). */
export const lagosDayEnd = (day) => new Date(lagosDayStart(day).getTime() + DAY_MS - 1);

/** `YYYY-MM-DD` shifted by whole days (negative for earlier). */
export const addDays = (day, days) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
