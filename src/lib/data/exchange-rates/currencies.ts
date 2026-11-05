import type { Latest, LatestRate } from "./schemas";

/**
 * Codes in the source data that must never be shown as currencies.
 * - NGN: the naira priced in naira. The source repo's own docs call these rows
 *   "likely mislabeled" (latest.json carries a stale NGN entry from 2012).
 * - UNKNOWN: rows with a CBN typo that could not be matched to a currency.
 */
const EXCLUDED_CODES = new Set(["NGN", "UNKNOWN"]);

/** Display order; any code not listed here goes after these, alphabetically. */
const DISPLAY_ORDER = [
  "USD", "EUR", "GBP", "CNY", "CHF", "JPY", "ZAR", "SAR", "AED", "DKK", "XOF", "XDR", "XUA",
];

export type CurrencyRate = LatestRate & { code: string };

export function listCurrencies(latest: Latest): CurrencyRate[] {
  const rank = (code: string) => {
    const i = DISPLAY_ORDER.indexOf(code);
    return i === -1 ? DISPLAY_ORDER.length : i;
  };
  return Object.entries(latest.rates)
    .filter(([code]) => !EXCLUDED_CODES.has(code))
    .map(([code, rate]) => ({ code, ...rate }))
    .sort((a, b) => rank(a.code) - rank(b.code) || a.code.localeCompare(b.code));
}