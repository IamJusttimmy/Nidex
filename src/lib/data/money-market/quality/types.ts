/** All 11 rate fields published by the CBN money market endpoint. */
export type MmRateField =
  | "mpr"
  | "mrr"
  | "interBankCallRate"
  | "treasuryBill"
  | "savingsDeposit"
  | "oneMonthDeposit"
  | "threeMonthsDeposit"
  | "sixMonthsDeposit"
  | "twelveMonthsDeposit"
  | "primeLending"
  | "maxLending";

export const MM_RATE_FIELDS: readonly MmRateField[] = [
  "mpr",
  "mrr",
  "interBankCallRate",
  "treasuryBill",
  "savingsDeposit",
  "oneMonthDeposit",
  "threeMonthsDeposit",
  "sixMonthsDeposit",
  "twelveMonthsDeposit",
  "primeLending",
  "maxLending",
];

/**
 * Quality status for a single rate field in a single observation.
 *
 * - valid           Parsed successfully; passes all checks.
 * - not-published   Empty string or "0.00" in a known non-publishing era.
 * - suspicious      "0.00" outside any known non-publishing era, or other
 *                   anomaly. Original value is preserved; value is set.
 * - invalid         Non-numeric, non-empty string. Cannot be parsed.
 */
export type MmQualityStatus =
  | "valid"
  | "not-published"
  | "suspicious"
  | "invalid";

/** Reason codes for non-valid classifications. */
export type MmReasonCode =
  | "mpr_pre_era_zero"          // mpr = "0.00" before 2006-12
  | "mrr_post_era_empty"        // mrr = "" on or after 2006-12
  | "interbank_trailing_empty"  // interBankCallRate = "" on or after 2026-03
  | "rate_zero_suspicious"      // "0.00" outside any known non-publishing era
  | "rate_empty_unexpected"     // "" in a period with no known publishing gap
  | "rate_unparseable";         // non-numeric string

export interface MmRateAssessment {
  /** Original string from CBN, never modified. */
  raw: string;
  /** Parsed float, or null when not-published. */
  value: number | null;
  status: MmQualityStatus;
  reason: MmReasonCode | null;
}

/** Configurable thresholds for quality checks. */
export interface MmRules {
  /** Version string, bumped when rules change. Format: YYYY-MM-DD.N */
  version: string;
  /**
   * First period (YYYY-MM) when MPR replaced MRR.
   * mpr = "0.00" before this → not-published.
   * mrr = "" on or after this → not-published.
   */
  mprStartPeriod: string;
  /**
   * First period (YYYY-MM) where interBankCallRate trailing empties begin.
   * interBankCallRate = "" on or after this → not-published.
   */
  interbankTrailingEmptyFrom: string;
}