import type { MmRateField, MmRateAssessment } from "../quality/types";

/** Raw record as returned by the CBN endpoint. All rate fields are strings. */
export interface MmSourceRecord {
  id: number;
  tyear: number;
  tmonth: number;
  period: string;
  interBankCallRate: string;
  mrr: string;
  mpr: string;
  treasuryBill: string;
  savingsDeposit: string;
  oneMonthDeposit: string;
  threeMonthsDeposit: string;
  sixMonthsDeposit: string;
  twelveMonthsDeposit: string;
  primeLending: string;
  maxLending: string;
}

/** One observation after normalization and quality classification. */
export interface MmObservation {
  /** CBN's original id from the source record. */
  id: number;
  /** Canonical period string: YYYY-MM. */
  period: string;
  /** CBN's original period label, e.g. "September 2026". */
  periodLabel: string;
  /** Quality-classified assessments for each rate field. */
  rates: Record<MmRateField, MmRateAssessment>;
}

/** One entry in the quality summary's rulesFired array. */
export interface MmRuleSummary {
  rule: string;
  description: string;
  status: string;
  field: MmRateField;
  count: number;
  /** Listed when count <= 20; omitted otherwise. */
  periods?: string[];
  /** Included when periods is omitted. */
  firstPeriod?: string;
  lastPeriod?: string;
}

/** Quality summary for the whole document. */
export interface MmQualitySummary {
  totalObservations: number;
  /** Observations where every field is valid or expected-not-published. */
  fullyValid: number;
  /** Observations with at least one suspicious field, no invalid. */
  withSuspicious: number;
  /** Observations with at least one invalid field. */
  withInvalid: number;
  rulesFired: MmRuleSummary[];
}

/** The full published document written to public/data/money-market/latest.json. */
export interface MmDocument {
  source: {
    publisher: string;
    endpoint: string;
    retrievedAt: string;   // ISO 8601 UTC
    rulesVersion: string;
  };
  coverage: {
    firstPeriod: string;   // YYYY-MM
    lastPeriod: string;    // YYYY-MM
    totalRecords: number;
  };
  quality: MmQualitySummary;
  /** Oldest first. */
  observations: MmObservation[];
}