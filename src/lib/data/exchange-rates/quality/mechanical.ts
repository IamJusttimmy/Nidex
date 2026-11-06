import type { QualityRules } from "./config";
import type { RateObservation } from "./types";

type Comparable = Pick<RateObservation, "date" | "code" | "buy" | "mid" | "sell" | "quality">;

/**
 * Evidence tests for mechanical data errors. Pure helpers, shared by the promotion
 * step (which acts on them) and the evidence report (which only describes them).
 */

/**
 * Power-of-ten shift: returns n (non-zero integer) when `value / 10^n` lands within
 * `tolerance` of BOTH the previous and the next observation, otherwise null.
 * Requiring both neighbours means the corrected value must fit the series on both sides.
 */
export function powerOfTenShift(value: number, previous: number, next: number, tolerance: number): number | null {
  if (!(value > 0) || !(previous > 0) || !(next > 0)) return null;
  for (let n = -6; n <= 6; n++) {
    if (n === 0) continue;
    const shifted = value / 10 ** n;
    if (Math.abs(shifted / previous - 1) < tolerance && Math.abs(shifted / next - 1) < tolerance) return n;
  }
  return null;
}

/**
 * Copied currency record: another currency has, on the same date, the SAME buy, mid AND
 * sell (the full set). The other record must itself be clean (buy and sell valid, quote
 * pair valid), so it is plausibly the source of the copy and not a second corrupted row.
 */
export function findCopySource<T extends Comparable>(target: Comparable, all: T[]): T | null {
  if (target.buy === null || target.mid === null || target.sell === null) return null;
  return (
    all.find(
      (x) =>
        x.date === target.date &&
        x.code !== target.code &&
        x.buy === target.buy &&
        x.mid === target.mid &&
        x.sell === target.sell &&
        x.quality.buy.status === "valid" &&
        x.quality.sell.status === "valid" &&
        x.quality.quotePair.status === "valid",
    ) ?? null
  );
}

/** True when `value` is more than `jump` away from BOTH neighbours (so the neighbours do not support it). */
export function unsupportedByNeighbours(value: number, previous: number, next: number, rules: QualityRules): boolean {
  return Math.abs(value / previous - 1) > rules.spikeJump && Math.abs(value / next - 1) > rules.spikeJump;
}
