export type QualityStatus = "valid" | "suspicious" | "invalid";

/**
 * Whether the source gave a usable value.
 * - published: a value was parsed.
 * - not-published: the source left it empty, or wrote 0 where 0 cannot be a real value.
 * - unparseable: the source wrote something that is not a readable value.
 */
export type Presence = "published" | "not-published" | "unparseable";

/** Every field Nidex judges. Each is classified on its own: one bad field never condemns the others. */
export type NtbField =
  | "auctionDate"
  | "tenor"
  | "maturityDate"
  | "rate"
  | "rateLabel"
  | "trueYield"
  | "rangeBid"
  | "successfulBidRates"
  | "amtOffered"
  | "totalSubscription"
  | "totalSuccessful";

export const NTB_FIELDS: readonly NtbField[] = [
  "auctionDate",
  "tenor",
  "maturityDate",
  "rate",
  "rateLabel",
  "trueYield",
  "rangeBid",
  "successfulBidRates",
  "amtOffered",
  "totalSubscription",
  "totalSuccessful",
] as const;

/** Stable machine-readable codes. The UI maps these to explanations. */
export const REASON_CODES = [
  // presence
  "not_published_empty",
  "not_published_zero",
  "unparseable",
  "negative_value",
  // tenor and maturity
  "tenor_label_variant",
  "tenor_not_standard",
  "maturity_not_after_auction",
  "maturity_inconsistent_with_tenor",
  // rate
  "rate_implausible",
  "rate_outside_bid_range",
  "rate_spike_reversion",
  "rate_label_standardised",
  "rate_label_unrecognised",
  // true yield
  "true_yield_inconsistent_with_rate",
  // bid ranges
  "bid_rate_implausible",
  "bid_range_reversed",
  "bid_range_single_value",
  "successful_range_outside_bid_range",
  // amounts
  "allotment_exceeds_subscription",
  "amount_scale_inconsistent",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface Reason {
  code: ReasonCode;
  /** Plain-language explanation shown to users. */
  message: string;
  /** The numbers behind the decision, so the flag can be audited. */
  detail?: Record<string, number | string | boolean | null>;
}

/** On a valid field, reasons are notes (for example "label standardised"). They never change a value. */
export interface FieldAssessment {
  status: QualityStatus;
  presence: Presence;
  reasons: Reason[];
}

/** A caution shown next to a record. Warnings never change a status or a value. */
export const WARNING_CODES = ["rate_differs_from_top_successful_bid", "conflicting_duplicate_auction"] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface Warning {
  code: WarningCode;
  message: string;
  detail?: Record<string, number | string>;
}

/** Fields that CBN publishes as text. Exactly what the endpoint returned. */
export const RAW_TEXT_FIELDS = [
  "auctionDate",
  "securityType",
  "tenor",
  "auctionNo",
  "auction",
  "week",
  "maturityDate",
  "totalSubscription",
  "totalSuccessful",
  "rangeBid",
  "successfulBidRates",
  "rateDescription",
  "rate",
  "trueYield",
  "amtOffered",
  "totalAmtRepaid",
  "netType",
  "netValue",
] as const;

export type RawTextField = (typeof RAW_TEXT_FIELDS)[number];

/** One CBN record exactly as received. Never modified. */
export type RawNtbRecord = { readonly id: number } & { readonly [K in RawTextField]: string };

export type TenorGroupDays = 91 | 182 | 364;

export interface BidRange {
  low: number;
  high: number;
}

export interface NtbObservation {
  id: number;
  /** The record exactly as CBN published it. */
  raw: RawNtbRecord;

  /** ISO yyyy-mm-dd; null if the source text could not be read. */
  auctionDate: string | null;
  maturityDate: string | null;
  daysToMaturity: number | null;

  tenor: {
    rawText: string;
    /** Days as written in the label, e.g. 363. Null if unreadable. */
    labelDays: number | null;
    /** The standard bill this belongs to (91, 182 or 364), or null if the label is not a standard tenor. */
    group: TenorGroupDays | null;
  };

  rate: number | null;
  rateLabel: { raw: string; display: string | null };
  trueYield: number | null;
  rangeBid: BidRange | null;
  successfulBidRates: BidRange | null;

  /**
   * Amounts exactly as numbers parsed from the source text. The unit has NOT been verified:
   * they appear to be millions of naira, but Nidex must not say so until that is confirmed.
   */
  amtOffered: number | null;
  totalSubscription: number | null;
  totalSuccessful: number | null;
  amountUnit: "unconfirmed";

  quality: Record<NtbField, FieldAssessment>;
  warnings: Warning[];
}

export const REJECTION_KINDS = [
  "not_an_object",
  "invalid_id",
  "duplicate_id",
  "security_type_not_ntb",
  "duplicate_content",
] as const;
export type RejectionKind = (typeof REJECTION_KINDS)[number];

/** A source record that could not become an observation. Retained, never dropped. */
export interface RejectedRecord {
  /** Position in the source array (0-based). */
  index: number;
  id: number | null;
  kind: RejectionKind;
  message: string;
  raw: unknown;
}

export interface NtbQualityReport {
  rulesVersion: string;
  sourceCount: number;
  observations: NtbObservation[];
  rejected: RejectedRecord[];
}