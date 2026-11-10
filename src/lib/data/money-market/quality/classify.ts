import type { MmRateField, MmRateAssessment, MmRules } from "./types";

/**
 * Classify a single rate field value for one observation period.
 *
 * @param field   The rate field name.
 * @param raw     The original string from CBN.
 * @param period  The observation period as YYYY-MM.
 * @param rules   The active quality rules.
 */
export function classifyRate(
  field: MmRateField,
  raw: string,
  period: string,
  rules: MmRules,
): MmRateAssessment {
  // --- Known non-publishing eras ---

  // MPR was introduced in December 2006. "0.00" before that = not published.
  if (field === "mpr" && raw === "0.00" && period < rules.mprStartPeriod) {
    return { raw, value: null, status: "not-published", reason: "mpr_pre_era_zero" };
  }

  // MRR was replaced by MPR in December 2006. Empty string after that = not published.
  if (field === "mrr" && raw === "" && period >= rules.mprStartPeriod) {
    return { raw, value: null, status: "not-published", reason: "mrr_post_era_empty" };
  }

  // Interbank call rate stopped being published from March 2026.
  if (
    field === "interBankCallRate" &&
    raw === "" &&
    period >= rules.interbankTrailingEmptyFrom
  ) {
    return { raw, value: null, status: "not-published", reason: "interbank_trailing_empty" };
  }

  // --- Generic empty string outside a known non-publishing era ---
  if (raw === "") {
    return { raw, value: null, status: "not-published", reason: "rate_empty_unexpected" };
  }

  // --- Parse the value ---
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { raw, value: null, status: "invalid", reason: "rate_unparseable" };
  }

  // --- Zero outside a known non-publishing era ---
  if (parsed === 0) {
    return { raw, value: 0, status: "suspicious", reason: "rate_zero_suspicious" };
  }

  // --- Valid ---
  return { raw, value: parsed, status: "valid", reason: null };
}