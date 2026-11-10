/** How far back the chart looks, counted from the newest auction shown (not from today). */
export const RANGES = [
  { key: "1Y", label: "1Y", years: 1 },
  { key: "5Y", label: "5Y", years: 5 },
  { key: "10Y", label: "10Y", years: 10 },
  { key: "ALL", label: "All", years: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/**
 * The earliest auction date (ISO) included for a range, or null for no limit. Counted back from `lastDate`
 * in whole calendar years. Works on the date text through UTC, so a time zone cannot shift the date.
 */
export function cutoffDate(range: RangeKey, lastDate: string): string | null {
  const years = RANGES.find((r) => r.key === range)?.years ?? null;
  if (years === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastDate);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]) - years, Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10);
}

/** Points on or after the cutoff, in their original order. A null cutoff keeps everything. */
export function inRange<T extends { date: string }>(points: readonly T[], cutoff: string | null): T[] {
  return cutoff === null ? [...points] : points.filter((p) => p.date >= cutoff);
}