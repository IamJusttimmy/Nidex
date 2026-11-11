// Quality classification types for mutual fund NAV data

export type MfNumericField =
  | "navNgn"
  | "navUsd"
  | "unitPriceNgn"
  | "offerPriceNgn"
  | "offerPriceUsd"
  | "bidPriceNgn"
  | "bidPriceUsd"
  | "unitholders"
  | "yieldWtd"
  | "yieldYtd";

export const MF_NUMERIC_FIELDS: readonly MfNumericField[] = [
  "navNgn",
  "navUsd",
  "unitPriceNgn",
  "offerPriceNgn",
  "offerPriceUsd",
  "bidPriceNgn",
  "bidPriceUsd",
  "unitholders",
  "yieldWtd",
  "yieldYtd",
];

export type MfQualityStatus =
  | "valid"
  | "not-published"
  | "suspicious"
  | "invalid";

export type MfReasonCode =
  | "field_absent_for_format"   // field does not exist in this file format (e.g. navUsd in 2011)
  | "value_blank"               // cell is empty / whitespace
  | "value_unparseable"         // non-numeric string where a number is expected
  | "value_zero_suspicious"     // 0 outside a known non-publishing era
  | "value_negative"            // negative NAV or price
  | "fund_missing_nav";         // fund row present but NAV cell is entirely absent

export interface MfFieldAssessment {
  raw: string | null;           // null means the column does not exist in this format
  value: number | null;
  status: MfQualityStatus;
  reason: MfReasonCode | null;
}

export interface MfRules {
  version: string;
}