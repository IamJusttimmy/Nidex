import type { MfFieldAssessment, MfReasonCode, MfRules } from "./types";
import type { MfSourceFormat } from "../pipeline/types";
import { FIELD_FORMATS } from "./config";
import type { MfNumericField } from "./types";

/**
 * Classify one numeric field value from a mutual fund observation.
 *
 * Rules applied in order:
 * 1. Field not provided by this source format → not-published / field_absent_for_format
 * 2. raw is null or blank → not-published / value_blank
 *    (unless fund_missing_nav applies — handled by the parser before calling here)
 * 3. Non-numeric string → invalid / value_unparseable
 * 4. Negative value → suspicious / value_negative
 * 5. Zero value → suspicious / value_zero_suspicious
 * 6. Otherwise → valid
 */
export function classifyField(
  field: MfNumericField,
  raw: string | null,
  format: MfSourceFormat,
  _rules: MfRules,
): MfFieldAssessment {
  // Rule 1 — field absent for this format
  if (!FIELD_FORMATS[field].includes(format)) {
    return { raw: null, value: null, status: "not-published", reason: "field_absent_for_format" };
  }

  // Rule 2 — blank / missing cell
  const trimmed = raw === null ? "" : raw.trim();
  if (trimmed === "" || trimmed === "-") {
    return { raw: raw ?? "", value: null, status: "not-published", reason: "value_blank" };
  }

  // Rule 3 — non-numeric
  const numeric = Number(trimmed.replace(/,/g, ""));
  if (!isFinite(numeric)) {
    return { raw: trimmed, value: null, status: "invalid", reason: "value_unparseable" };
  }

  // Rule 4 — negative (NAV or price should never be negative)
  if (numeric < 0) {
    return { raw: trimmed, value: numeric, status: "suspicious", reason: "value_negative" };
  }

  // Rule 5 — zero
  if (numeric === 0) {
    return { raw: trimmed, value: 0, status: "suspicious", reason: "value_zero_suspicious" };
  }

  // Rule 6 — valid
  return { raw: trimmed, value: numeric, status: "valid", reason: null };
}

/**
 * Special-case assessment for a fund row where the NAV cell is entirely
 * absent from the spreadsheet (not blank — the cell doesn't exist).
 * Used by the parser when it detects fund 39-style missing rows.
 */
export function absentNavAssessment(): MfFieldAssessment {
  return { raw: null, value: null, status: "not-published", reason: "fund_missing_nav" };
}