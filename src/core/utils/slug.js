/** "Tolu's Pot & Grill" → "tolus-pot-grill". Accents are dropped (Àmàlà → amala). */
export const slugify = (text) =>
  String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * A slug nobody else has: `base`, then `base-2`, `base-3`, ...
 * `isTaken(slug)` checks the table (exclude the row being renamed).
 */
export const uniqueSlug = async (text, isTaken, { fallback = 'store', maxLength = 80 } = {}) => {
  const base = slugify(text).slice(0, maxLength).replace(/-+$/, '') || fallback;
  if (!(await isTaken(base))) return base;

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, maxLength - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
};
