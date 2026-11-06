import type { ParsedObservation } from "./types";
import type { QualityRules } from "./config";

/** Relative spread of a quote: |sell - buy| / ((buy + sell) / 2). Does not use `mid`. */
export function relativeSpread(buy: number, sell: number): number {
  return Math.abs(sell - buy) / ((buy + sell) / 2);
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Normal spread per currency = the MEDIAN relative spread over all of that
 * currency's quotes that have both buy and sell and buy <= sell.
 * The median is used because a few corrupted rows (spreads of 1,000,000%)
 * cannot move it, unlike a mean or a high percentile.
 */
export function computeSpreadBaselines(
  observations: ParsedObservation[],
  rules: QualityRules,
): Map<string, number> {
  const byCode = new Map<string, number[]>();
  for (const o of observations) {
    if (o.buy === null || o.sell === null || o.buy > o.sell) continue;
    const list = byCode.get(o.code) ?? [];
    list.push(relativeSpread(o.buy, o.sell));
    byCode.set(o.code, list);
  }
  const out = new Map<string, number>();
  for (const [code, spreads] of byCode) {
    spreads.sort((a, b) => a - b);
    out.set(code, Math.max(median(spreads), rules.spreadBaselineFloor));
  }
  return out;
}
