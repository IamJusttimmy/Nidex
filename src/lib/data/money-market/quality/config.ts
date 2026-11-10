import type { MmRateField, MmRules } from "./types";

export const MM_RULES: MmRules = {
  version: "2026-11-10.1",
  mprStartPeriod: "2006-12",
  interbankTrailingEmptyFrom: "2026-03",
};

export const FIELD_LABELS: Record<MmRateField, string> = {
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

export const SHORT_LABELS: Record<MmRateField, string> = {
  mpr:                 "MPR",
  mrr:                 "MRR",
  interBankCallRate:   "Interbank",
  treasuryBill:        "T-bill (MM)",
  savingsDeposit:      "Savings",
  oneMonthDeposit:     "1-Mo Deposit",
  threeMonthsDeposit:  "3-Mo Deposit",
  sixMonthsDeposit:    "6-Mo Deposit",
  twelveMonthsDeposit: "12-Mo Deposit",
  primeLending:        "Prime",
  maxLending:          "Max Lending",
};

export const FIELD_NOTES: Partial<Record<MmRateField, string>> = {
  mpr: "CBN benchmark rate. Replaced MRR from December 2006.",
  mrr: "CBN benchmark rate prior to MPR. Published January–November 2006 only.",
  interBankCallRate: "Overnight rate between Nigerian banks.",
  treasuryBill: "CBN money market indicator. Distinct from individual T-bill auction rates.",
};

/** First period (YYYY-MM inclusive) each field began publishing, for reference. */
export const FIELD_ERA_FROM: Record<MmRateField, string> = {
  mpr:                 "2006-12",
  mrr:                 "2006-01",
  interBankCallRate:   "2006-01",
  treasuryBill:        "2006-01",
  savingsDeposit:      "2006-01",
  oneMonthDeposit:     "2006-01",
  threeMonthsDeposit:  "2006-01",
  sixMonthsDeposit:    "2006-01",
  twelveMonthsDeposit: "2006-01",
  primeLending:        "2006-01",
  maxLending:          "2006-01",
};

/** Last period (YYYY-MM inclusive) each field publishes, or null if still active. */
export const FIELD_ERA_TO: Partial<Record<MmRateField, string>> = {
  mrr: "2006-11",
};