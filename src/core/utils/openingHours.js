// Opening hours in Africa/Lagos (WAT, UTC+1 all year). Same rules as the frontend's
// src/lib/opening-hours.js. `hours`: [{ day: 0–6 (Sunday = 0), open: 'HH:MM', close: 'HH:MM', closed }]

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/** Day of week and minutes since midnight in Lagos. */
export const lagosClock = (date = new Date()) => {
  const d = new Date(new Date(date).getTime() + LAGOS_OFFSET_MS);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

const dayEntry = (hours, day) => hours?.find((h) => h.day === day && !h.closed) ?? null;

/** True when the hours cover `date` (Lagos time); a close before the open time runs past midnight. */
export const isOpenAt = (hours = [], date = new Date()) => {
  const { day, minutes } = lagosClock(date);
  const today = dayEntry(hours, day);
  if (today) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  const yesterday = dayEntry(hours, (day + 6) % 7);
  if (yesterday) {
    const open = toMinutes(yesterday.open);
    const close = toMinutes(yesterday.close);
    if (close <= open && minutes < close) return true;
  }
  return false;
};
