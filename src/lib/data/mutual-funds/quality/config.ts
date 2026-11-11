import type { MfRules, MfNumericField } from "./types";

export const MF_RULES: MfRules = {
  version: "2026-11-11.1",
};

/** Human-readable label for each numeric field */
export const FIELD_LABELS: Record<MfNumericField, string> = {
  navNgn: "NAV (₦)",
  navUsd: "NAV ($)",
  unitPriceNgn: "Unit Price (₦)",
  offerPriceNgn: "Offer Price (₦)",
  offerPriceUsd: "Offer Price ($)",
  bidPriceNgn: "Bid Price (₦)",
  bidPriceUsd: "Bid Price ($)",
  unitholders: "Unitholders",
  yieldWtd: "Yield WTD (%)",
  yieldYtd: "Yield YTD (%)",
};

/** Short label for chart axes / tooltips */
export const SHORT_LABELS: Record<MfNumericField, string> = {
  navNgn: "NAV ₦",
  navUsd: "NAV $",
  unitPriceNgn: "Unit Price ₦",
  offerPriceNgn: "Offer Price ₦",
  offerPriceUsd: "Offer Price $",
  bidPriceNgn: "Bid Price ₦",
  bidPriceUsd: "Bid Price $",
  unitholders: "Unitholders",
  yieldWtd: "Yield WTD%",
  yieldYtd: "Yield YTD%",
};

/**
 * Which source formats provide each field.
 * A field absent from a format is classified as `field_absent_for_format`.
 */
export const FIELD_FORMATS: Record<MfNumericField, Array<"2011" | "2026">> = {
  navNgn:        ["2011", "2026"],
  navUsd:        ["2026"],
  unitPriceNgn:  ["2011"],
  offerPriceNgn: ["2026"],
  offerPriceUsd: ["2026"],
  bidPriceNgn:   ["2026"],
  bidPriceUsd:   ["2026"],
  unitholders:   ["2026"],
  yieldWtd:      ["2026"],
  yieldYtd:      ["2026"],
};