import type { QualityRules } from "./config";
import { findCopySource, powerOfTenShift, unsupportedByNeighbours } from "./mechanical";
import type { QualityAssessment, RateField, RateObservation } from "./types";

type Item = Omit<RateObservation, "verification" | "verificationNote">;

const isReversion = (a: QualityAssessment) => a.reasons.some((r) => r.code.startsWith("single_observation_reversion"));
const rowHasReversion = (o: Item) => isReversion(o.quality.buy) || isReversion(o.quality.sell);

/**
 * Promotes a suspicious value to invalid only on strong, mechanical evidence:
 *  - power of ten: value / 10^n fits BOTH the previous and next observation, or
 *  - copied currency: the full buy/mid/sell set equals a clean record of another currency
 *    on the same date, and the neighbours of the affected currency do not support the value.
 * Only the fields that are individually affected are changed (buy and/or sell, and the
 * midpoint when it shows the same error). The original reasons stay; a new reason is added.
 * Returns new objects; inputs are never mutated.
 */
export function promoteMechanicalErrors(items: Item[], rules: QualityRules): Item[] {
  if (!rules.promoteMechanicalErrors) return items;

  const byCode = new Map<string, Item[]>();
  for (const o of items) {
    const list = byCode.get(o.code);
    if (list) list.push(o);
    else byCode.set(o.code, [o]);
  }

  const copies = items.map((o) => ({ ...o, quality: { ...o.quality } }));
  const indexOf = new Map(items.map((o, i) => [o, i] as const));

  for (const series of byCode.values()) {
    series.forEach((o, i) => {
      if (!rowHasReversion(o)) return;
      const out = copies[indexOf.get(o)!];

      // nearest neighbours that are not themselves reversion-flagged, for the midpoint check
      let p = i - 1;
      while (p >= 0 && (rowHasReversion(series[p]) || series[p].mid === null)) p--;
      let n = i + 1;
      while (n < series.length && (rowHasReversion(series[n]) || series[n].mid === null)) n++;
      const midPrev = p >= 0 ? series[p].mid : null;
      const midNext = n < series.length ? series[n].mid : null;

      const source = findCopySource(o, items);

      const mark = (f: RateField, reason: QualityAssessment["reasons"][number]) => {
        out.quality = {
          ...out.quality,
          [f]: { status: "invalid", reasons: [...o.quality[f].reasons, reason] },
        };
      };

      for (const f of ["buy", "sell"] as const) {
        const a = o.quality[f];
        const hit = a.reasons.find((r) => r.code === "single_observation_reversion");
        if (a.status !== "suspicious" || !hit || o[f] === null) continue;
        const previous = Number(hit.detail?.previous);
        const next = Number(hit.detail?.next);
        const value = o[f] as number;

        const exp = powerOfTenShift(value, previous, next, rules.powerOfTenTolerance);
        if (exp !== null) {
          mark(f, {
            code: "mechanical_error_power_of_ten",
            message: `The ${f} price equals the surrounding prices multiplied by 10^${exp} (a decimal-place slip): dividing it by 10^${exp} fits both the previous and the next observation.`,
            detail: { exponent: exp, previous, value, next },
          });
          continue;
        }
        if (source && source[f] === o[f] && unsupportedByNeighbours(value, previous, next, rules)) {
          mark(f, {
            code: "mechanical_error_copied_currency",
            message: `The ${f} price is identical to ${source.code} on the same date (buy, mid and sell all match), while this currency's own previous and next observations are about ${Math.round(previous)} and ${Math.round(next)}.`,
            detail: { copiedFrom: source.code, previous, value, next },
          });
        }
      }

      // The midpoint of the same row, judged on its own neighbours and only when buy or sell was promoted.
      const promoted = (["buy", "sell"] as const).filter((f) => out.quality[f].status === "invalid" && o.quality[f].status !== "invalid");
      if (promoted.length > 0 && o.mid !== null && midPrev !== null && midNext !== null && out.quality.mid.status !== "invalid") {
        const exp = powerOfTenShift(o.mid, midPrev, midNext, rules.powerOfTenTolerance);
        if (exp !== null) {
          mark("mid", {
            code: "mechanical_error_power_of_ten",
            message: `The midpoint shows the same decimal-place slip as the ${promoted.join(" and ")} price (x10^${exp}).`,
            detail: { exponent: exp, previous: midPrev, value: o.mid, next: midNext },
          });
        } else if (source && source.mid === o.mid && unsupportedByNeighbours(o.mid, midPrev, midNext, rules)) {
          mark("mid", {
            code: "mechanical_error_copied_currency",
            message: `The midpoint is identical to ${source.code} on the same date and far from this currency's own neighbours.`,
            detail: { copiedFrom: source.code, previous: midPrev, value: o.mid, next: midNext },
          });
        }
      }
    });
  }
  return copies;
}
