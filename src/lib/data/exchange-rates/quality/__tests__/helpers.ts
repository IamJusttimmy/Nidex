import { buildQualityReport, DEFAULT_RULES, type QualityRules, type RateObservation, type VerificationOverride } from "../index";

export type Row = [date: string, code: string, buy: string, mid: string, sell: string];

export function toCsv(rows: Row[]): string {
  return ["date,code,buy,mid,sell", ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

/** n normal days for USD around 1000 with a 1 naira spread, starting 2024-01-01. */
export function normalDays(n: number, startDay = 1, code = "USD", level = 1000): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const d = `2024-01-${String(startDay + i).padStart(2, "0")}`;
    const buy = level + i;
    return [d, code, String(buy), String(buy + 0.5), String(buy + 1)] as Row;
  });
}

export function run(rows: Row[], rules: QualityRules = DEFAULT_RULES, overrides: VerificationOverride[] = []) {
  return buildQualityReport(toCsv(rows), rules, overrides);
}

export function find(obs: RateObservation[], date: string, code = "USD"): RateObservation {
  const o = obs.find((x) => x.date === date && x.code === code);
  if (!o) throw new Error(`no observation ${code} ${date}`);
  return o;
}
