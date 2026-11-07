import {
  flaggedObservations,
  type QualityStatus,
  type RateObservation,
  type Reason,
} from "./quality";

/** Pure helpers that turn classified observations into what the detail page shows. */

export type RangeKey = "1M" | "3M" | "6M" | "1Y" | "5Y" | "All";

export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 91 },
  { key: "6M", label: "6M", days: 182 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "5Y", label: "5Y", days: 1826 },
  { key: "All", label: "All", days: null },
];

/** ISO date plus a number of days (negative goes back). Works in UTC so time zones cannot interfere. */
export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** First date to include for a range, measured back from the latest observation (not from today). */
export function cutoffFor(range: RangeKey, lastDate: string): string | null {
  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  return days === null ? null : addDays(lastDate, -days);
}

export function inRange<T extends { date: string }>(points: T[], cutoff: string | null): T[] {
  return cutoff === null ? points : points.filter((p) => p.date >= cutoff);
}

export function worstStatus(o: RateObservation): QualityStatus {
  const s = [o.quality.buy.status, o.quality.mid.status, o.quality.sell.status, o.quality.quotePair.status];
  return s.includes("invalid") ? "invalid" : s.includes("suspicious") ? "suspicious" : "valid";
}

/** True when buy and sell are both present and both passed every check. */
function isCleanQuote(o: RateObservation): o is RateObservation & { buy: number; sell: number } {
  return (
    o.buy !== null &&
    o.sell !== null &&
    o.quality.buy.status === "valid" &&
    o.quality.sell.status === "valid" &&
    o.quality.quotePair.status === "valid"
  );
}

const byDate = (a: RateObservation, b: RateObservation) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export interface LatestValues {
  date: string;
  buy: number;
  sell: number;
  spread: number;
  previousDate: string | null;
  buyChange: number | null;
  buyChangePct: number | null;
}

export interface LatestResult {
  /** The newest observation whose buy and sell both passed every check. */
  latest: LatestValues | null;
  /** A newer publication that was NOT used because it is flagged, so the page can say so. */
  newerFlagged: RateObservation | null;
}

export function latestValues(observations: RateObservation[]): LatestResult {
  const sorted = [...observations].sort(byDate);
  const clean = sorted.filter(isCleanQuote);
  const last = clean.at(-1);
  if (!last) return { latest: null, newerFlagged: null };
  const prev = clean.length > 1 ? clean[clean.length - 2] : null;
  const newer = sorted.filter((o) => o.date > last.date && (o.buy !== null || o.sell !== null)).at(-1) ?? null;
  return {
    latest: {
      date: last.date,
      buy: last.buy,
      sell: last.sell,
      spread: last.sell - last.buy,
      previousDate: prev?.date ?? null,
      buyChange: prev ? last.buy - prev.buy : null,
      buyChangePct: prev ? (last.buy / prev.buy - 1) * 100 : null,
    },
    newerFlagged: newer,
  };
}

export interface Summary {
  high: { value: number; date: string } | null;
  low: { value: number; date: string } | null;
  since: string | null;
  total: number;
  valid: number;
  suspicious: number;
  invalid: number;
}

/** Highs and lows use only values that passed every check. Counts cover every published observation. */
export function summarize(observations: RateObservation[]): Summary {
  const sorted = [...observations].sort(byDate);
  let high: Summary["high"] = null;
  let low: Summary["low"] = null;
  for (const o of sorted) {
    if (!isCleanQuote(o)) continue;
    if (!high || o.buy > high.value) high = { value: o.buy, date: o.date };
    if (!low || o.buy < low.value) low = { value: o.buy, date: o.date };
  }
  const counts = { valid: 0, suspicious: 0, invalid: 0 };
  for (const o of sorted) counts[worstStatus(o)]++;
  return { high, low, since: sorted[0]?.date ?? null, total: sorted.length, ...counts };
}

export interface RecentRow {
  date: string;
  buy: number;
  sell: number;
  /** Change in the buying rate against the previous checked value; null when this row is flagged or first. */
  buyChange: number | null;
  /** True for suspicious rows, which are shown with a warning. */
  flagged: boolean;
}

/** The latest `count` observations that can be shown in a table: invalid ones are listed under flagged records instead. */
export function recentRows(observations: RateObservation[], count: number): RecentRow[] {
  const sorted = [...observations].sort(byDate);
  const rows: RecentRow[] = [];
  let previousClean: number | null = null;
  for (const o of sorted) {
    if (o.buy === null || o.sell === null) continue;
    if (worstStatus(o) === "invalid") continue;
    const clean = isCleanQuote(o);
    rows.push({
      date: o.date,
      buy: o.buy,
      sell: o.sell,
      buyChange: clean && previousClean !== null ? o.buy - previousClean : null,
      flagged: worstStatus(o) === "suspicious",
    });
    if (clean) previousClean = o.buy;
  }
  return rows.slice(-count).reverse();
}

export interface FlagLine {
  label: string;
  status: Exclude<QualityStatus, "valid">;
  message: string;
}

const FIELD_LABELS = { buy: "Buying", mid: "Midpoint", sell: "Selling", quotePair: "Buying and selling" } as const;

/** One line per non-valid field, in plain words, for the flagged-records table. */
export function flagLines(o: RateObservation): FlagLine[] {
  const lines: FlagLine[] = [];
  for (const field of ["quotePair", "buy", "sell", "mid"] as const) {
    const a = o.quality[field];
    if (a.status === "valid") continue;
    // The last reason is the strongest one: a promotion adds its evidence after the original reason.
    const reason: Reason | undefined = a.reasons.at(-1);
    lines.push({ label: FIELD_LABELS[field], status: a.status, message: reason?.message ?? "Flagged." });
  }
  return lines;
}

/** Newest first. */
export function flaggedNewestFirst(observations: RateObservation[]): RateObservation[] {
  return flaggedObservations(observations).sort((a, b) => byDate(b, a));
}

export const VERIFICATION_LABELS = {
  "not-required": "Not needed",
  pending: "Not yet checked",
  unresolved: "Checked, unresolved",
  corroborated: "Corroborated",
} as const;