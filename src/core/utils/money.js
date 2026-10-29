// Money is integer kobo everywhere (₦3,500 = 350000). Never store or add floats.

export const isKobo = (value) => Number.isSafeInteger(value);

/** Naira as a person types it (3500 or 3500.5) → integer kobo. */
export const nairaToKobo = (naira) => Math.round(Number(naira) * 100);

/** `pct` percent of an amount, rounded to the nearest kobo (1.5% of ₦1,000 = 1500). */
export const percentOfKobo = (kobo, pct) => Math.round((kobo * pct) / 100);

export const sumKobo = (amounts) => amounts.reduce((total, amount) => total + amount, 0);

/** ₦8,500 or ₦1,250.50 (kobo shown only when there are some) — for SMS and email text. */
export const formatNaira = (kobo) => {
  const hasKobo = kobo % 100 !== 0;
  const naira = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: hasKobo ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
  return `₦${naira}`;
};
