/** Pure text readers. They never guess: anything unclear is reported as unparseable. */

export type NumberParse =
  | { kind: "empty" }
  | { kind: "zero" }
  | { kind: "number"; value: number }
  | { kind: "unparseable" };

const NUMBER = /^-?\d+(?:\.\d+)?$/;

export function parseNumber(text: string): NumberParse {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  if (!NUMBER.test(t)) return { kind: "unparseable" };
  const value = Number(t);
  return value === 0 ? { kind: "zero" } : { kind: "number", value };
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** "November-04-2026" -> "2026-11-04". Null if it is not a real calendar date. */
export function parseCbnDate(text: string): string | null {
  const m = /^\s*([A-Za-z]+)-(\d{1,2})-(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf((m[1] ?? "").toLowerCase());
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (month < 0) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Whole days from one ISO date to another (negative if the second is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "91DAY", "182 Days", "364 " and "91" all read as a number of days. Anything else is null. */
export function parseTenorDays(text: string): number | null {
  const m = /^\s*(\d{1,4})\s*(?:days?)?\s*$/i.exec(text);
  return m ? Number(m[1]) : null;
}

export type BidRangeParse =
  | { kind: "empty" }
  | { kind: "zero" }
  | { kind: "unparseable" }
  | { kind: "single"; value: number }
  | { kind: "range"; low: number; high: number };

const N = String.raw`(\d+(?:\.\d+)?)`;
const RANGE = new RegExp(`^${N}\\s*%?\\s*[-\\u2013\\u2014]\\s*${N}\\s*%?$`);
const SINGLE = new RegExp(`^${N}\\s*%?$`);

/**
 * Reads "15.0000 - 15.4000", "19.5000% - 21.0000%", "9.2500– 11.0000" and a lone "14.4900%".
 * Text with a stray space inside a number, or on several lines, is unparseable.
 */
export function parseBidRange(text: string): BidRangeParse {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  const r = RANGE.exec(t);
  if (r) return { kind: "range", low: Number(r[1]), high: Number(r[2]) };
  const s = SINGLE.exec(t);
  if (s) {
    const value = Number(s[1]);
    return value === 0 ? { kind: "zero" } : { kind: "single", value };
  }
  return { kind: "unparseable" };
}

export type RateLabelDisplay = "Issue" | "Marginal" | "Stop";

const LABELS: Record<string, RateLabelDisplay> = {
  issue: "Issue",
  "issue rates": "Issue",
  marginal: "Marginal",
  maginal: "Marginal",
  stop: "Stop",
  slop: "Stop",
};

/**
 * Standardises the wording of the rate label (typos and plural only). It does NOT decide whether
 * "Issue", "Marginal" and "Stop" mean the same thing; the original label is always kept beside it.
 */
export function standardiseRateLabel(text: string): RateLabelDisplay | null {
  return LABELS[text.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

/** Expected true yield (percent) for a discount rate (percent) and a bill of `days` days. */
export function expectedTrueYield(ratePercent: number, days: number): number {
  const d = ratePercent / 100;
  return (d / (1 - (d * days) / 365)) * 100;
}