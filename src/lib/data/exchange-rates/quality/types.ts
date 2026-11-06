export type QualityStatus = "valid" | "suspicious" | "invalid";

export type VerificationStatus =
  | "not-required"
  | "pending"
  | "corroborated"
  | "unresolved";

export type RateField = "buy" | "mid" | "sell";

/** Stable machine-readable codes. The UI maps these to explanations. */
export type ReasonCode =
  | "buy_above_sell"
  | "single_observation_reversion"
  | "single_observation_reversion_abnormal_spread"
  | "mid_outside_range_minor"
  | "mid_outside_range_major"
  | "mechanical_error_power_of_ten"
  | "mechanical_error_copied_currency"
  | "not_published";

/** A caution shown next to a value. Warnings never change a status or a value. */
export interface Warning {
  code: "cross_rate_break";
  message: string;
  detail?: Record<string, number | string>;
}

export interface Reason {
  code: ReasonCode;
  /** Plain-language explanation shown to users. */
  message: string;
  /** The numbers behind the decision, so the flag can be audited. */
  detail?: Record<string, number | string>;
}

export interface QualityAssessment {
  status: QualityStatus;
  reasons: Reason[];
}

/** Exactly what the CSV said, as text. Never modified. */
export interface RawValues {
  buy: string;
  mid: string;
  sell: string;
}

export interface RateObservation {
  date: string; // ISO yyyy-mm-dd, observation date
  code: string;
  /** 1-based data row number in the source CSV (header excluded). */
  sourceRow: number;
  raw: RawValues;
  /** Normalised numbers; null when the source did not publish a value. */
  buy: number | null;
  mid: number | null;
  sell: number | null;
  quality: {
    buy: QualityAssessment;
    mid: QualityAssessment;
    sell: QualityAssessment;
    quotePair: QualityAssessment;
  };
  /** Evidence-only cautions (e.g. a broken cross rate). Independent of `quality`. */
  warnings: Warning[];
  verification: VerificationStatus;
  verificationNote?: string;
}

export type RejectionKind =
  | "wrong_column_count"
  | "invalid_date"
  | "invalid_code"
  | "invalid_number"
  | "duplicate_key";

/** A source row that could not become an observation. Retained, never dropped. */
export interface RejectedRow {
  sourceRow: number;
  kind: RejectionKind;
  message: string;
  rawFields: string[];
}

export interface ParsedObservation {
  date: string;
  code: string;
  sourceRow: number;
  raw: RawValues;
  buy: number | null;
  mid: number | null;
  sell: number | null;
}
