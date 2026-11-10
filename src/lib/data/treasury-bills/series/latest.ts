import type { QualityStatus, Reason, TenorGroupDays } from "../quality";
import type { RateLabelSeries, RateSeriesPoint } from "./types";

/** The true-yield parts of an observation. The series itself never reads them; the latest-auction table does. */
export interface LatestObservation {
  id: number;
  trueYield: number | null;
  raw: { trueYield: string };
  quality: {
    trueYield: { status: QualityStatus; presence: "published" | "not-published" | "unparseable"; reasons: Reason[] };
  };
}

/**
 * What to show for a true yield.
 * - value: CBN published a number. `status` says whether it passed the checks; the number is shown either way.
 * - not-published: CBN left it empty or wrote 0.0000. Shown as "Not published", with CBN's own text kept in `raw`.
 * - unreadable: CBN wrote something that is not a number. `raw` is shown as written.
 * Nothing is calculated here, ever.
 */
export interface TrueYieldCell {
  kind: "value" | "not-published" | "unreadable";
  value: number | null;
  /** The text exactly as CBN published it. */
  raw: string;
  status: QualityStatus;
  /** Why the checker questioned it (only when status is not valid). */
  message: string | null;
}

export interface LatestAuctionRow {
  tenor: TenorGroupDays;
  /** The newest auction of this tenor that is shown on the chart. */
  point: RateSeriesPoint;
  trueYield: TrueYieldCell | null;
  /** A newer auction whose rate is suspicious and therefore hidden (null when there is none, or when suspicious rates are shown). */
  newerSuspicious: RateSeriesPoint | null;
}

const TENORS: readonly TenorGroupDays[] = [91, 182, 364];

export function trueYieldCell(o: LatestObservation): TrueYieldCell {
  const q = o.quality.trueYield;
  const kind = q.presence === "published" ? "value" : q.presence === "not-published" ? "not-published" : "unreadable";
  return {
    kind,
    value: kind === "value" ? o.trueYield : null,
    raw: o.raw.trueYield,
    status: q.status,
    message: q.status === "valid" ? null : (q.reasons[0]?.message ?? null),
  };
}

/**
 * The newest shown auction for each tenor of one rate label, with its true yield alongside.
 *
 * `shown` is the series on the chart. `withSuspicious` is the same label built with suspicious rates included,
 * used only to notice when a newer rate is being hidden. The two lists are joined to true yields by record id.
 */
export function latestAuctionRows(
  shown: RateLabelSeries | undefined,
  withSuspicious: RateLabelSeries | undefined,
  observations: ReadonlyMap<number, LatestObservation>,
): LatestAuctionRow[] {
  if (!shown) return [];
  const rows: LatestAuctionRow[] = [];
  for (const tenor of TENORS) {
    const points = shown.tenors[tenor];
    const point = points[points.length - 1];
    if (!point) continue;
    const shownIds = new Set(points.map((p) => p.id));
    const hidden = (withSuspicious?.tenors[tenor] ?? []).filter((p) => !shownIds.has(p.id) && p.date > point.date);
    const obs = observations.get(point.id);
    rows.push({ tenor, point, trueYield: obs ? trueYieldCell(obs) : null, newerSuspicious: hidden[hidden.length - 1] ?? null });
  }
  return rows;
}