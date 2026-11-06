import { DEFAULT_RULES, type QualityRules } from "./config";
import { relativeSpread } from "./baseline";
import type {
  ParsedObservation,
  QualityAssessment,
  RateField,
  RateObservation,
  Reason,
} from "./types";

/** Stage 4 + 5: field-level and quote-pair classification. Pure; never edits values. */

const fresh = (): QualityAssessment => ({ status: "valid", reasons: [] });

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export interface ReversionResult {
  jump: number;
  revert: number;
  /** The values the decision compared against. */
  previous: number;
  next: number;
  /** True when a neighbour that was itself flagged had to be skipped (see findReversions). */
  refined: boolean;
}

/**
 * single_observation_reversion: the value jumps away from the previous published
 * observation by more than `spikeJump`, and the NEXT published observation is back
 * within `spikeRevert` of the previous one. "Observation" = the previous/next row
 * for the same currency, which may be days apart (weekends, holidays).
 * Returns null when it cannot be evaluated (no previous or next value) or does not fire.
 */
export function detectReversion(
  prev: number | null | undefined,
  cur: number | null,
  next: number | null | undefined,
  rules: QualityRules,
): ReversionResult | null {
  if (prev == null || cur === null || next == null || prev <= 0) return null;
  const jump = Math.abs(cur / prev - 1);
  const revert = Math.abs(next / prev - 1);
  return jump > rules.spikeJump && revert < rules.spikeRevert
    ? { jump, revert, previous: prev, next, refined: false }
    : null;
}

/**
 * Runs detectReversion over a whole series of one field, in two passes.
 *
 * Pass 1 compares every value with its immediate neighbours. Its weakness: a
 * normal value sitting BETWEEN two corrupted ones looks like a spike (DKK on
 * 2025-06-19: 238, with 1,781 on both sides). So in pass 2, any flagged value
 * with a flagged neighbour is re-checked against the nearest neighbours that were
 * NOT flagged in pass 1. Values are never changed; only the verdict can be.
 */
export function findReversions(values: (number | null)[], rules: QualityRules): (ReversionResult | null)[] {
  const pass1 = values.map((v, i) => detectReversion(values[i - 1], v, values[i + 1], rules));
  return pass1.map((hit, i) => {
    if (!hit || !(pass1[i - 1] || pass1[i + 1])) return hit;
    let p = i - 1;
    while (p >= 0 && (pass1[p] || values[p] === null)) p--;
    let n = i + 1;
    while (n < values.length && (pass1[n] || values[n] === null)) n++;
    const again = detectReversion(p >= 0 ? values[p] : undefined, values[i], n < values.length ? values[n] : undefined, rules);
    return again ? { ...again, refined: true } : null;
  });
}

function escalate(target: QualityAssessment, status: "suspicious" | "invalid", reason: Reason) {
  target.reasons.push(reason);
  if (status === "invalid" || target.status === "valid") target.status = status;
}

/**
 * Classify one currency's series (any order; sorted here by date).
 * `baseline` is that currency's normal relative spread.
 */
export function classifySeries(
  series: ParsedObservation[],
  baseline: number,
  rules: QualityRules = DEFAULT_RULES,
): Omit<RateObservation, "verification" | "verificationNote">[] {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const reversions = {
    buy: findReversions(sorted.map((o) => o.buy), rules),
    sell: findReversions(sorted.map((o) => o.sell), rules),
  };

  return sorted.map((o, i) => {
    const quality = { buy: fresh(), mid: fresh(), sell: fresh(), quotePair: fresh() };

    for (const f of ["buy", "mid", "sell"] as const) {
      if (o[f] === null) {
        quality[f].reasons.push({ code: "not_published", message: `The source did not publish a ${f} value ("${o.raw[f]}").` });
      }
    }

    // Quote pair: buying price above selling price.
    if (o.buy !== null && o.sell !== null && o.buy > o.sell) {
      escalate(quality.quotePair, "invalid", {
        code: "buy_above_sell",
        message: "The buying price is higher than the selling price, which a quote pair should not be.",
        detail: { buy: o.buy, sell: o.sell },
      });
    }

    // Spike and reversion, evaluated separately on buy and sell.
    const abnormalSpread =
      o.buy !== null && o.sell !== null && relativeSpread(o.buy, o.sell) > rules.spreadMultiplier * baseline;
    for (const f of ["buy", "sell"] as RateField[]) {
      const hit = reversions[f as "buy" | "sell"][i];
      if (!hit) continue;
      const detail = {
        previous: hit.previous,
        value: o[f] as number,
        next: hit.next,
        jump: Number(hit.jump.toFixed(4)),
        revert: Number(hit.revert.toFixed(4)),
        ...(hit.refined ? { comparedWithNearestUnflaggedNeighbours: "yes" } : {}),
      };
      if (abnormalSpread) {
        escalate(quality[f], "invalid", {
          code: "single_observation_reversion_abnormal_spread",
          message: `The ${f} price jumped ${pct(hit.jump)} from the previous observation and returned at the next, and the buy–sell gap on this date is far wider than normal for ${o.code}.`,
          detail: { ...detail, spread: Number(relativeSpread(o.buy!, o.sell!).toFixed(6)), normalSpread: Number(baseline.toFixed(6)) },
        });
      } else {
        escalate(quality[f], "suspicious", {
          code: "single_observation_reversion",
          message: `The ${f} price jumped ${pct(hit.jump)} from the previous observation and returned at the next. The buy–sell gap is normal, so this could be a genuine one-observation move.`,
          detail,
        });
      }
    }

    // Midpoint: judged on its own, never changes buy or sell. The range check is skipped when the
    // quote pair is invalid, because the range itself is then unreliable (see QualityRules).
    const rangeUsable = !(rules.skipMidRangeCheckWhenPairInvalid && quality.quotePair.status === "invalid");
    if (rangeUsable && o.mid !== null && o.buy !== null && o.sell !== null) {
      const lo = Math.min(o.buy, o.sell);
      const hi = Math.max(o.buy, o.sell);
      const excess = o.mid < lo ? lo - o.mid : o.mid > hi ? o.mid - hi : 0;
      if (excess > rules.midRoundingTolerance) {
        // How far outside, measured from the nearest edge of the buy-sell range.
        const deviation = excess / (o.mid < lo ? lo : hi);
        const detail = { mid: o.mid, buy: o.buy, sell: o.sell, outsideBy: Number(excess.toFixed(4)), outsideByFraction: Number(deviation.toFixed(6)) };
        if (deviation > rules.midInvalidDeviation) {
          escalate(quality.mid, "invalid", {
            code: "mid_outside_range_major",
            message: `The midpoint is ${pct(deviation)} outside the buy–sell range, far more than rounding explains.`,
            detail,
          });
        } else {
          escalate(quality.mid, "suspicious", {
            code: "mid_outside_range_minor",
            message: `The midpoint sits slightly outside the buy–sell range (${pct(deviation)}), more than rounding explains.`,
            detail,
          });
        }
      }
    }

    return {
      date: o.date,
      code: o.code,
      sourceRow: o.sourceRow,
      raw: o.raw,
      buy: o.buy,
      mid: o.mid,
      sell: o.sell,
      quality,
      warnings: [],
    };
  });
}

