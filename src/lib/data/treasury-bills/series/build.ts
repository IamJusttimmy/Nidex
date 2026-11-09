import { isRateSeriesEligible, type TenorGroupDays } from "../quality";
import type {
  ExclusionReason,
  LabelKind,
  RateLabelSeries,
  RateSeriesOptions,
  RateSeriesPoint,
  RateSeriesSet,
  SeriesObservation,
} from "./types";

const TENORS: readonly TenorGroupDays[] = [91, 182, 364];

/** Order of the standard labels in the selector. Any other label follows, then "no label". */
const STANDARD_ORDER = ["Issue", "Marginal", "Stop"];

function labelIdentity(raw: string, display: string | null): { key: string; name: string; kind: LabelKind } {
  if (display !== null) return { key: display, name: display, kind: "standard" };
  const text = raw.trim();
  if (text === "") return { key: "unlabelled", name: "No label published", kind: "unlabelled" };
  return { key: `other:${text.toLowerCase().replace(/\s+/g, " ")}`, name: text, kind: "unrecognised" };
}

/** Why an observation is not in the series. Only used for counting; eligibility itself is decided by isRateSeriesEligible. */
function exclusionReason(o: SeriesObservation): ExclusionReason {
  if (o.auctionDate === null) return "no_auction_date";
  if (o.tenor.group === null) return "tenor_not_standard";
  if (o.rate === null || o.quality.rate.presence !== "published") return "rate_not_published";
  return o.quality.rate.status === "suspicious" ? "rate_suspicious_hidden" : "rate_invalid";
}

function emptyTenors(): Record<TenorGroupDays, RateSeriesPoint[]> {
  return { 91: [], 182: [], 364: [] };
}

/**
 * Builds the historical rate series, one set per rate label and one line per tenor.
 *
 * - Eligibility is exactly `isRateSeriesEligible`: only the rate field decides. A flag on the maturity
 *   date, true yield, bid ranges or amounts never removes a valid rate.
 * - Labels are never merged. Issue, Marginal and Stop are separate series. Only typos and plurals of the
 *   same label (for example "Maginal") share an option, and every original wording is listed and kept on
 *   each point.
 * - Nothing is changed or calculated: each point carries the rate as published.
 * - The input is not modified.
 */
export function buildRateSeries(observations: readonly SeriesObservation[], options: RateSeriesOptions = {}): RateSeriesSet {
  const byKey = new Map<string, RateLabelSeries>();
  const rawCounts = new Map<string, Map<string, number>>();
  const byReason: Record<ExclusionReason, number> = {
    no_auction_date: 0,
    tenor_not_standard: 0,
    rate_not_published: 0,
    rate_invalid: 0,
    rate_suspicious_hidden: 0,
  };
  let included = 0;

  for (const o of observations) {
    // isRateSeriesEligible is the single source of truth. The null checks only let TypeScript see the values are present.
    if (!isRateSeriesEligible(o, options) || o.auctionDate === null || o.tenor.group === null || o.rate === null) {
      byReason[exclusionReason(o)] += 1;
      continue;
    }
    const status = o.quality.rate.status;
    if (status === "invalid") {
      // Cannot happen (eligibility never accepts an invalid rate); kept so the types stay honest.
      byReason.rate_invalid += 1;
      continue;
    }

    const id = labelIdentity(o.rateLabel.raw, o.rateLabel.display);
    let series = byKey.get(id.key);
    if (!series) {
      series = { key: id.key, name: id.name, kind: id.kind, rawLabels: [], pointCount: 0, firstDate: o.auctionDate, lastDate: o.auctionDate, tenors: emptyTenors() };
      byKey.set(id.key, series);
      rawCounts.set(id.key, new Map());
    }

    series.tenors[o.tenor.group].push({
      id: o.id,
      date: o.auctionDate,
      rate: o.rate,
      rawLabel: o.rateLabel.raw,
      displayLabel: o.rateLabel.display,
      rawTenor: o.tenor.rawText,
      rateStatus: status,
      rateReasons: o.quality.rate.reasons.map((r) => ({ ...r })),
      warnings: o.warnings.map((w) => w.code),
    });
    series.pointCount += 1;
    if (o.auctionDate < series.firstDate) series.firstDate = o.auctionDate;
    if (o.auctionDate > series.lastDate) series.lastDate = o.auctionDate;
    const counts = rawCounts.get(id.key)!;
    counts.set(o.rateLabel.raw, (counts.get(o.rateLabel.raw) ?? 0) + 1);
    included += 1;
  }

  const labels = [...byKey.values()];
  for (const series of labels) {
    for (const tenor of TENORS) series.tenors[tenor].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    series.rawLabels = [...rawCounts.get(series.key)!.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  }
  labels.sort((a, b) => rank(a) - rank(b) || b.pointCount - a.pointCount || a.name.localeCompare(b.name));

  const excludedTotal = Object.values(byReason).reduce((sum, n) => sum + n, 0);
  return { labels, considered: observations.length, included, excluded: { total: excludedTotal, byReason } };
}

function rank(s: RateLabelSeries): number {
  if (s.kind === "standard") {
    const i = STANDARD_ORDER.indexOf(s.name);
    return i === -1 ? STANDARD_ORDER.length : i;
  }
  return s.kind === "unrecognised" ? 100 : 200;
}

/**
 * Which label to show first: the one with the most points (ties go to the selector order). The rule is
 * about volume only. It does not say that label is "the" rate. The page must name the label it shows.
 */
export function defaultLabelKey(set: RateSeriesSet): string | null {
  let best: RateLabelSeries | null = null;
  for (const s of set.labels) if (best === null || s.pointCount > best.pointCount) best = s;
  return best ? best.key : null;
}