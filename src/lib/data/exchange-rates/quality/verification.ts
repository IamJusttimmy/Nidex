import type { RateObservation, VerificationStatus } from "./types";

/**
 * Verification is separate from quality. It records what has been done to check a
 * flagged value against outside sources. It never changes the quality status.
 */
export interface VerificationOverride {
  date: string;
  /** Currency code, or "*" for every currency on that date. */
  code: string;
  status: Exclude<VerificationStatus, "not-required">;
  note: string;
  /** Where the checking was done, so the claim can be re-checked. */
  sources?: string[];
}

type WithoutVerification = Omit<RateObservation, "verification" | "verificationNote">;

export function applyVerification(
  items: WithoutVerification[],
  overrides: VerificationOverride[] = [],
): RateObservation[] {
  return items.map((o) => {
    const q = o.quality;
    const flagged =
      q.buy.status !== "valid" || q.mid.status !== "valid" || q.sell.status !== "valid" || q.quotePair.status !== "valid";
    const hasSuspicious = [q.buy, q.mid, q.sell, q.quotePair].some((a) => a.status === "suspicious");

    // Only suspicious observations need verification. Invalid ones are structurally
    // unusable (e.g. buy above sell), and valid ones were never in question.
    if (!flagged || !hasSuspicious) return { ...o, verification: "not-required" as const };

    const ov = overrides.find((x) => x.date === o.date && (x.code === o.code || x.code === "*"));
    if (ov) return { ...o, verification: ov.status, verificationNote: ov.note };
    return { ...o, verification: "pending" as const };
  });
}
