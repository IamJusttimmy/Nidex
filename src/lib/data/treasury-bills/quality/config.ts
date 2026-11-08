import type { NtbField, TenorGroupDays } from "./types";

export interface TenorGroup {
  /** The standard bill: 91, 182 or 364 days. */
  days: TenorGroupDays;
  /** Day counts a label may carry and still be grouped here (e.g. "363 DAY" in a holiday week). */
  labelDays: number[];
  /** Inclusive range of days between auction and maturity that fits this bill. */
  maturityDays: [number, number];
}

/**
 * Every threshold the checker uses lives here, in one versioned object.
 * Changing a value only changes how the SAME stored records are classified.
 * Source values are never modified, so every classification is reversible.
 */
export interface NtbRules {
  version: string;
  tenorGroups: TenorGroup[];

  /** A percentage rate or yield above this is not a real rate (corruption such as 196300). */
  maxPlausibleRatePercent: number;
  /** The stop rate may sit outside the published bid range by up to this many percentage points (rounding). */
  bidRangeTolerance: number;
  /**
   * True yield is compared with what the published rate implies for the bill:
   * yield = d / (1 - d * days / 365), with d the discount rate. Evidence only; nothing is replaced.
   * A difference above this many percentage points makes the true yield suspicious.
   */
  trueYieldTolerance: number;

  /** rate_spike_reversion: a move of at least this many percentage points ... */
  spikeMinJumpPoints: number;
  /** ... and at least this fraction of the previous rate ... */
  spikeMinJumpRatio: number;
  /** ... that is undone at the next auction, which returns at least (1 - this) of the way back. */
  spikeRevertFraction: number;

  /**
   * For these fields CBN writes 0.0000 where it means "no value". Zero is treated as not published,
   * never as a number. Amount fields are included because a zero offer, subscription or allotment
   * only occurs on placeholder rows in the current data (see the quality report).
   */
  zeroMeansMissing: NtbField[];

  /**
   * amount_scale_inconsistent: when the larger of total subscription and total allotment is at least this
   * many times the amount offered (or at most 1/this), the three amounts are on very different scales.
   * The cause is not established: it may be values written in different units, or a data-entry error in
   * the source. The rule only reports the inconsistency. In the current data it flags 7 records; every
   * other record is under about 500 times the offer (see the quality report, amounts section).
   */
  amountScaleRatio: number;

  /** Amounts are kept raw. The unit is unverified and must not be displayed as a fact. */
  amountUnit: { status: "unconfirmed"; hypothesis: string };
}

export const DEFAULT_RULES: NtbRules = {
  version: "2026-11-08.1",
  tenorGroups: [
    { days: 91, labelDays: [90, 91], maturityDays: [90, 92] },
    { days: 182, labelDays: [181, 182], maturityDays: [181, 184] },
    { days: 364, labelDays: [363, 364, 365], maturityDays: [363, 366] },
  ],
  maxPlausibleRatePercent: 100,
  bidRangeTolerance: 0.01,
  trueYieldTolerance: 0.05,
  spikeMinJumpPoints: 3,
  spikeMinJumpRatio: 0.3,
  spikeRevertFraction: 0.25,
  amountScaleRatio: 500,
  zeroMeansMissing: [
    "rate",
    "trueYield",
    "rangeBid",
    "successfulBidRates",
    "amtOffered",
    "totalSubscription",
    "totalSuccessful",
  ],
  amountUnit: { status: "unconfirmed", hypothesis: "millions of naira (not verified)" },
};

/**
 * How the amount fields (amtOffered, totalSubscription, totalSuccessful) may be used until their unit
 * is established. The unit is unconfirmed and the data shows scale inconsistencies (see the quality
 * report). A single published value may be displayed with a visible "unit unconfirmed" label. Anything
 * that combines or compares amounts across records may not be built.
 */
export const AMOUNT_USAGE_POLICY = {
  unitStatus: "unconfirmed",
  label: "unit unconfirmed",
  singleValueDisplay: "allowed-with-label",
  historicalCharts: "not-allowed",
  totalsAndSums: "not-allowed",
  comparisonsAcrossRecords: "not-allowed",
} as const;