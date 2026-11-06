import type { QualityStatus, RateField, RateObservation, Reason, Warning } from "./types";

export interface ChartPoint {
  date: string;
  value: number;
  /** "valid" points are drawn normally; others only when the user opts in. */
  status: QualityStatus;
  reasons: Reason[];
  /** Evidence-only cautions; shown beside the point, never used to hide it. */
  warnings: Warning[];
}

export interface ChartOptions {
  /** "Show flagged observations": include suspicious values as distinct markers. */
  showFlagged?: boolean;
  /** Raw-value inspection: include invalid values. Off by default. */
  showInvalid?: boolean;
}

/** Stage 6: the series a chart plots for one field. Other fields never affect it, except that an invalid quote pair removes the pair's buy and sell. */
export function buildChartSeries(
  observations: RateObservation[],
  field: RateField,
  { showFlagged = false, showInvalid = false }: ChartOptions = {},
): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const o of observations) {
    const value = o[field];
    if (value === null) continue;

    const own = o.quality[field];
    const pair = field === "mid" ? null : o.quality.quotePair;
    const status: QualityStatus =
      own.status === "invalid" || pair?.status === "invalid"
        ? "invalid"
        : own.status === "suspicious" || pair?.status === "suspicious"
          ? "suspicious"
          : "valid";

    if (status === "invalid" && !showInvalid) continue;
    if (status === "suspicious" && !showFlagged) continue;
    points.push({
      date: o.date,
      value,
      status,
      reasons: [...own.reasons.filter((r) => r.code !== "not_published"), ...(pair?.reasons ?? [])],
      warnings: o.warnings,
    });
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Rows for the "flagged records" view: anything with a non-valid field or pair. */
export function flaggedObservations(observations: RateObservation[]): RateObservation[] {
  return observations.filter((o) =>
    [o.quality.buy, o.quality.mid, o.quality.sell, o.quality.quotePair].some((a) => a.status !== "valid"),
  );
}
