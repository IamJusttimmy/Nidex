import type { MmObservation } from "../money-market/pipeline/types";
import type { MmRateField } from "../money-market/quality/types";

export interface MmDataPoint {
  period: string;       // YYYY-MM
  periodLabel: string;  // e.g. "September 2026"
  value: number | null; // null = gap in line
  suspicious: boolean;
}

export interface MmSeries {
  field: MmRateField | "policy";
  label: string;
  points: MmDataPoint[];
  /** Note shown below the chart for this series. */
  note: string;
}

/**
 * The special combined policy-rate series key.
 * Uses MRR for periods before 2006-12, MPR from 2006-12 onward.
 */
export const POLICY_SERIES_KEY = "policy" as const;
export type MmSeriesKey = MmRateField | typeof POLICY_SERIES_KEY;

export const POLICY_SERIES_NOTE =
  "The CBN Monetary Policy Rate (MPR) replaced the Minimum Rediscount Rate (MRR) " +
  "in December 2006. This series combines MRR (January–November 2006) and MPR " +
  "(December 2006 onward) into one continuous policy-rate line.";

const FIELD_NOTES: Partial<Record<MmRateField, string>> = {
  interBankCallRate:
    "Overnight rate at which Nigerian banks lend to each other. " +
    "CBN stopped publishing this figure from March 2026.",
  treasuryBill:
    "CBN money market indicator for the T-bill rate. " +
    "This is a separate figure from individual T-bill auction rates published on the Treasury Bills page.",
  savingsDeposit:   "Average rate offered by commercial banks on savings deposits.",
  oneMonthDeposit:  "Average rate offered by commercial banks on 1-month fixed deposits.",
  threeMonthsDeposit: "Average rate offered by commercial banks on 3-month fixed deposits.",
  sixMonthsDeposit:   "Average rate offered by commercial banks on 6-month fixed deposits.",
  twelveMonthsDeposit: "Average rate offered by commercial banks on 12-month fixed deposits.",
  primeLending: "Rate at which commercial banks lend to their most creditworthy customers.",
  maxLending:   "Maximum rate at which commercial banks may lend.",
};

const FIELD_LABELS: Record<MmRateField, string> = {
  mpr:                 "Monetary Policy Rate",
  mrr:                 "Minimum Rediscount Rate",
  interBankCallRate:   "Interbank Call Rate",
  treasuryBill:        "Treasury Bill Rate (money market)",
  savingsDeposit:      "Savings Deposit Rate",
  oneMonthDeposit:     "1-Month Deposit Rate",
  threeMonthsDeposit:  "3-Month Deposit Rate",
  sixMonthsDeposit:    "6-Month Deposit Rate",
  twelveMonthsDeposit: "12-Month Deposit Rate",
  primeLending:        "Prime Lending Rate",
  maxLending:          "Maximum Lending Rate",
};

/** Build a chart series for a single rate field. */
function buildFieldSeries(
  observations: MmObservation[],
  field: MmRateField,
): MmSeries {
  const points: MmDataPoint[] = observations.map((obs) => {
    const a = obs.rates[field];
    return {
      period:      obs.period,
      periodLabel: obs.periodLabel,
      value:       a.status === "not-published" ? null : a.value,
      suspicious:  a.status === "suspicious",
    };
  });

  return {
    field,
    label: FIELD_LABELS[field],
    points,
    note: FIELD_NOTES[field] ?? "",
  };
}

/** Build the combined MPR/MRR policy-rate series. */
function buildPolicySeries(observations: MmObservation[]): MmSeries {
  const MPR_START = "2006-12";

  const points: MmDataPoint[] = observations.map((obs) => {
    const useMpr = obs.period >= MPR_START;
    const a = useMpr ? obs.rates.mpr : obs.rates.mrr;
    return {
      period:      obs.period,
      periodLabel: obs.periodLabel,
      value:       a.status === "not-published" ? null : a.value,
      suspicious:  a.status === "suspicious",
    };
  });

  return {
    field:  POLICY_SERIES_KEY,
    label:  "Policy rate (MPR / MRR)",
    points,
    note:   POLICY_SERIES_NOTE,
  };
}

/**
 * Build a chart series for the given key.
 *
 * @param observations  All observations from the document, oldest first.
 * @param key           A rate field name, or "policy" for the combined series.
 */
export function buildMmSeries(
  observations: MmObservation[],
  key: MmSeriesKey,
): MmSeries {
  if (key === POLICY_SERIES_KEY) return buildPolicySeries(observations);
  return buildFieldSeries(observations, key);
}

/**
 * Ordered list of dropdown options for the chart.
 * Policy rate first, then grouped by category.
 */
export const MM_CHART_OPTIONS: { key: MmSeriesKey; label: string; group: string }[] = [
  { key: "policy",              label: "Policy rate (MPR / MRR)",         group: "Monetary Policy" },
  { key: "interBankCallRate",   label: "Interbank Call Rate",              group: "Money Market"    },
  { key: "treasuryBill",        label: "Treasury Bill Rate (money market)",group: "Money Market"    },
  { key: "savingsDeposit",      label: "Savings Deposit Rate",             group: "Deposit Rates"   },
  { key: "oneMonthDeposit",     label: "1-Month Deposit Rate",             group: "Deposit Rates"   },
  { key: "threeMonthsDeposit",  label: "3-Month Deposit Rate",             group: "Deposit Rates"   },
  { key: "sixMonthsDeposit",    label: "6-Month Deposit Rate",             group: "Deposit Rates"   },
  { key: "twelveMonthsDeposit", label: "12-Month Deposit Rate",            group: "Deposit Rates"   },
  { key: "primeLending",        label: "Prime Lending Rate",               group: "Lending Rates"   },
  { key: "maxLending",          label: "Maximum Lending Rate",             group: "Lending Rates"   },
];