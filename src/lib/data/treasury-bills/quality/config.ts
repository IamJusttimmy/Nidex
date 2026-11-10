import type { NtbField, RawTextField, ReasonCode, RejectionKind, TenorGroupDays, WarningCode } from "./types";

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

/** Plain names for the judged fields, for display. */
export const FIELD_LABELS: Record<NtbField, string> = {
  auctionDate: "Auction date",
  tenor: "Tenor",
  maturityDate: "Maturity date",
  rate: "Rate",
  rateLabel: "Rate label",
  trueYield: "True yield",
  rangeBid: "Range of bids",
  successfulBidRates: "Successful bids",
  amtOffered: "Amount offered",
  totalSubscription: "Total subscription",
  totalSuccessful: "Total successful",
};

/** Which field of the CBN record holds the published text for each judged field. */
export const RAW_KEY_OF_FIELD = {
  auctionDate: "auctionDate",
  tenor: "tenor",
  maturityDate: "maturityDate",
  rate: "rate",
  rateLabel: "rateDescription",
  trueYield: "trueYield",
  rangeBid: "rangeBid",
  successfulBidRates: "successfulBidRates",
  amtOffered: "amtOffered",
  totalSubscription: "totalSubscription",
  totalSuccessful: "totalSuccessful",
} as const satisfies Record<NtbField, RawTextField>;

/** The judged fields that hold amounts. Their unit is unconfirmed (see AMOUNT_USAGE_POLICY). */
export const AMOUNT_FIELDS: readonly NtbField[] = ["amtOffered", "totalSubscription", "totalSuccessful"];

/** One short name per rule, for display. Every rule code must have one (the type enforces it). */
export const REASON_TITLES: Record<ReasonCode, string> = {
  not_published_empty: "CBN left the value empty",
  not_published_zero: "CBN wrote zero where zero cannot be a real value",
  unparseable: "Not a readable value",
  negative_value: "Negative value",
  tenor_label_variant: "Tenor written as a variant, such as 363 days",
  tenor_not_standard: "Not a standard 91, 182 or 364-day tenor",
  maturity_not_after_auction: "Maturity date is not after the auction date",
  maturity_inconsistent_with_tenor: "Maturity date does not fit the tenor",
  rate_implausible: "Value too high to be real",
  rate_outside_bid_range: "Rate outside the published range of bids",
  rate_spike_reversion: "Rate jumps for one auction, then returns",
  rate_label_standardised: "Label spelling standardised",
  rate_label_unrecognised: "Label not recognised",
  true_yield_inconsistent_with_rate: "True yield differs from what the rate implies",
  bid_rate_implausible: "Bid rate too high to be real",
  bid_range_reversed: "Range of bids written backwards",
  bid_range_single_value: "One rate given instead of a range",
  successful_range_outside_bid_range: "Successful bids outside the range of all bids",
  allotment_exceeds_subscription: "More allotted than was subscribed",
  amount_scale_inconsistent: "Amounts on very different scales within one record",
};

export const WARNING_TITLES: Record<WarningCode, string> = {
  rate_differs_from_top_successful_bid: "Rate differs from the highest successful bid",
  conflicting_duplicate_auction: "Another record for the same auction has different values",
};

export const REJECTION_TITLES: Record<RejectionKind, string> = {
  not_an_object: "Not a record",
  invalid_id: "Missing or invalid id",
  duplicate_id: "Id used by another record",
  security_type_not_ntb: "Not a Treasury bill",
  duplicate_content: "Exact repeat of another record",
};
