// Number formatting shared by the content checks (scripts/verify.mjs) and the renderer. Every
// number on a card is produced by one of these, so a value in content/*.json can be recomputed and
// compared as a string.
//
// Rounding is half-up with a small epsilon, so 8.25 → 8.3 and 29.75 → 29.8 even when the binary
// float sits a hair below the tie.

const EPS = 1e-9;

/** Rounds to `places` decimals, half-up. */
export const round = (x, places = 0) => {
  const f = 10 ** places;
  return Math.round(x * f + (x < 0 ? -EPS : EPS)) / f;
};

const groupThousands = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Money in dollars. Whole dollars print without cents ($16,000); anything with cents prints two
 * decimals ($307.69). `cents: 'always'` forces two decimals ($300.00); `cents: 'never'` rounds to
 * the dollar ($101,316).
 */
export function usd(x, { cents = 'auto', sign = false } = {}) {
  const v = cents === 'never' ? round(x, 0) : round(x, 2);
  const abs = Math.abs(v);
  const whole = Math.floor(abs + EPS);
  const frac = round(abs - whole, 2);
  let s;
  if (cents === 'never' || (cents === 'auto' && frac === 0)) s = groupThousands(String(whole));
  else s = groupThousands(abs.toFixed(2));
  const prefix = v < 0 ? '−$' : sign ? '+$' : '$';
  return `${prefix}${s}`;
}

/** Percent to one decimal: 0.293 → "29.3%". `sign` prints a leading + for positive values. */
export const pct1 = (ratio, { sign = false } = {}) => {
  const v = round(ratio * 100, 1);
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(1)}%`;
};

/** A plain number with thousands separators and a fixed number of decimals. */
export const num = (x, places = 0) => groupThousands(round(x, places).toFixed(places));

/** Cents under a dollar: 0.293 → "29.3¢". */
export const cents = (dollars, places = 1) => `${round(dollars * 100, places).toFixed(places)}¢`;

/**
 * Reads the number out of an input string: "$9,610" → 9610, "7.65%" → 0.0765, "10¢" → 0.10,
 * "520 h" → 520, "1.5×" → 1.5. Used by verify.mjs, so the content file stays human-readable.
 */
export function parseInput(value) {
  if (typeof value === 'number') return value;
  const m = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return String(value); // a text input such as "next business day"; formulas that need a number will fail loudly
  const n = Number(m[0]);
  if (/%/.test(value)) return n / 100;
  if (/¢/.test(value)) return n / 100;
  return n;
}
