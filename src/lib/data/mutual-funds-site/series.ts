import type { MfNumericField } from "../mutual-funds/quality/types";
import type { MfObservationSite } from "./schema";

export type MfChartField = MfNumericField;

export const MF_CHART_FIELD_OPTIONS: { key: MfChartField; label: string }[] = [
  { key: "navNgn", label: "NAV (NGN)" },
  { key: "navUsd", label: "NAV (USD)" },
  { key: "unitPriceNgn", label: "Unit price (NGN)" },
  { key: "offerPriceNgn", label: "Offer price (NGN)" },
  { key: "offerPriceUsd", label: "Offer price (USD)" },
  { key: "bidPriceNgn", label: "Bid price (NGN)" },
  { key: "bidPriceUsd", label: "Bid price (USD)" },
  { key: "unitholders", label: "Unitholders" },
  { key: "yieldWtd", label: "Weekly yield (%)" },
  { key: "yieldYtd", label: "Year-to-date yield (%)" },
];

export interface MfFundSeriesPoint {
  reportingDate: string;
  value: number | null;
}

export interface MfFundSeries {
  fundName: string;
  field: MfChartField;
  points: MfFundSeriesPoint[];
}

/** Return the newest available observation for each fund, newest reporting date first. */
export function getLatestObservations(
  observations: MfObservationSite[],
): MfObservationSite[] {
  const latestByFund = new Map<string, MfObservationSite>();

  for (const observation of observations) {
    const current = latestByFund.get(observation.fundName);
    if (!current || observation.reportingDate > current.reportingDate) {
      latestByFund.set(observation.fundName, observation);
    }
  }

  return [...latestByFund.values()].sort(
    (a, b) =>
      b.reportingDate.localeCompare(a.reportingDate) ||
      a.fundName.localeCompare(b.fundName),
  );
}

export function getCategories(observations: MfObservationSite[]): string[] {
  return [...new Set(observations.flatMap((observation) => observation.category ? [observation.category] : []))]
    .sort((a, b) => a.localeCompare(b));
}

export function getFundNames(observations: MfObservationSite[]): string[] {
  return [...new Set(observations.map((observation) => observation.fundName))]
    .sort((a, b) => a.localeCompare(b));
}

/** Build a fund's chronological history for one numeric field. */
export function buildFundSeries(
  observations: MfObservationSite[],
  fundName: string,
  field: MfChartField,
): MfFundSeries {
  const points = observations
    .filter((observation) => observation.fundName === fundName)
    .map((observation) => ({
      reportingDate: observation.reportingDate,
      value: observation.fields[field].value,
    }))
    .sort((a, b) => a.reportingDate.localeCompare(b.reportingDate));

  return { fundName, field, points };
}
