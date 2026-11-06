import { DEFAULT_RULES, type QualityRules } from "./config";
import { computeSpreadBaselines } from "./baseline";
import { classifySeries } from "./classify";
import { attachCrossRateWarnings } from "./crossrate";
import { promoteMechanicalErrors } from "./promotion";
import { parseRatesCsv, type ParseResult } from "./parse";
import { applyVerification, type VerificationOverride } from "./verification";
import type { ParsedObservation, RateObservation } from "./types";

export interface QualityReport {
  rules: QualityRules;
  /** Every parsed source row, classified. Nothing is removed here. */
  observations: RateObservation[];
  /** Source rows that could not be parsed at all, kept with the reason. */
  rejected: ParseResult["rejected"];
  sourceRowCount: number;
  /** Rows set aside before classification because they are not a foreign currency (e.g. the NGN base). Counted, never hidden. */
  excluded: { code: string; rows: number }[];
  /** Normal relative spread per currency used by the abnormal-spread rule. */
  spreadBaselines: Record<string, number>;
}

/** Re-run stages 4-5 on already-parsed data. This is how a rule change is previewed: same rows, new rules. */
export function classifyParsed(
  parsed: ParsedObservation[],
  rules: QualityRules = DEFAULT_RULES,
  overrides: VerificationOverride[] = [],
): { observations: RateObservation[]; spreadBaselines: Record<string, number> } {
  const baselines = computeSpreadBaselines(parsed, rules);
  const byCode = new Map<string, ParsedObservation[]>();
  for (const o of parsed) {
    const list = byCode.get(o.code);
    if (list) list.push(o);
    else byCode.set(o.code, [o]);
  }

  const classified = [...byCode.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([code, series]) => classifySeries(series, baselines.get(code) ?? rules.spreadBaselineFloor, rules));

  return {
    observations: applyVerification(attachCrossRateWarnings(promoteMechanicalErrors(classified, rules), rules), overrides),
    spreadBaselines: Object.fromEntries(baselines),
  };
}

/** Full pipeline: raw CSV text in, classified observations out. The input text is never altered. */
export function buildQualityReport(
  csvText: string,
  rules: QualityRules = DEFAULT_RULES,
  overrides: VerificationOverride[] = [],
  excludeCodes: string[] = ["NGN"],
): QualityReport {
  const parsed = parseRatesCsv(csvText);
  const kept = parsed.observations.filter((o) => !excludeCodes.includes(o.code));
  const excluded = excludeCodes
    .map((code) => ({ code, rows: parsed.observations.filter((o) => o.code === code).length }))
    .filter((e) => e.rows > 0);
  const { observations, spreadBaselines } = classifyParsed(kept, rules, overrides);
  return { rules, observations, rejected: parsed.rejected, sourceRowCount: parsed.sourceRowCount, excluded, spreadBaselines };
}
