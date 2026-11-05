/**
 * Where the prepared exchange-rate files live. Override with
 * NEXT_PUBLIC_RATES_BASE_URL (no trailing slash) to point at our own copy later.
 */
export const RATES_BASE_URL =
  process.env.NEXT_PUBLIC_RATES_BASE_URL ??
  "https://raw.githubusercontent.com/bukunmialuko/cbn-rates/main/data";