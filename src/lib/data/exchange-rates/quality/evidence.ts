import type { QualityRules } from "./config";
import { DEFAULT_RULES } from "./config";
import { findCopySource, powerOfTenShift } from "./mechanical";
import type { RateObservation } from "./types";

/**
 * EVIDENCE ONLY. Describes why a flagged value might be corrupted, for the review
 * report and the UI. Never changes a status. (Promotion to invalid happens in promotion.ts
 * and uses the same strict tests.)
 */
export type EvidenceKind =
  | "power_of_ten_shift"
  | "matches_other_currency"
  | "table_wide_event" // several other currencies reverted on the same date
  | "none";

export interface Evidence {
  kind: EvidenceKind;
  note: string;
}

const isReversion = (o: RateObservation) =>
  [o.quality.buy, o.quality.sell].some((a) => a.reasons.some((r) => r.code.startsWith("single_observation_reversion")));

export function explainFlagged(
  target: RateObservation,
  all: RateObservation[],
  rules: QualityRules = DEFAULT_RULES,
  minPeers = 3,
): Evidence {
  for (const f of ["buy", "sell"] as const) {
    const hit = target.quality[f].reasons.find((r) => r.code.startsWith("single_observation_reversion"));
    if (!hit || target[f] === null) continue;
    const n = powerOfTenShift(target[f] as number, Number(hit.detail?.previous), Number(hit.detail?.next), rules.powerOfTenTolerance);
    if (n !== null) return { kind: "power_of_ten_shift", note: `${f} fits both neighbours after dividing by 10^${n}` };
  }
  const twin = findCopySource(target, all);
  if (twin) return { kind: "matches_other_currency", note: `buy, mid and sell are identical to ${twin.code} on the same date` };
  const peers = all.filter((x) => x.date === target.date && x.code !== target.code && isReversion(x)).length;
  if (peers >= minPeers) return { kind: "table_wide_event", note: `${peers} other currencies show the same jump and reversion on this date` };
  return { kind: "none", note: "no mechanical explanation found" };
}
