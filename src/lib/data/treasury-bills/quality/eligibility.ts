import type { NtbField, NtbObservation, Presence, QualityStatus, TenorGroupDays } from "./types";

/**
 * Which observations may take part in which use. Eligibility is decided per field: a problem in one
 * field limits only that field's use. It never condemns the rest of the record.
 */

/** True if the field has a published value that passed every check. */
export function isFieldUsable(o: NtbObservation, field: NtbField): boolean {
  const a = o.quality[field];
  return a.status === "valid" && a.presence === "published";
}

/** Maturity date use (for example showing a bill's maturity). Judged on the maturity date alone. */
export function isMaturityDateUsable(o: NtbObservation): boolean {
  return o.maturityDate !== null && isFieldUsable(o, "maturityDate");
}

/**
 * The only parts of an observation that decide rate-series eligibility. A full observation fits this, and
 * so does anything narrower that carries these fields.
 */
export interface RateSeriesCandidate {
  auctionDate: string | null;
  tenor: { group: TenorGroupDays | null };
  rate: number | null;
  quality: { rate: { status: QualityStatus; presence: Presence } };
}

/**
 * May this observation appear in the historical series of its tenor (91, 182 or 364 days)?
 *
 * Only three things decide it: the auction date is readable, the tenor falls in a standard group, and
 * the `rate` field itself is published and valid (or, when the viewer asks to see questionable values,
 * suspicious). The maturity date, true yield, bid ranges, rate label and amounts are NOT consulted, so
 * a flag on any of them never removes a valid rate from its series. An invalid rate is never included.
 */
export function isRateSeriesEligible(o: RateSeriesCandidate, options: { includeSuspicious?: boolean } = {}): boolean {
  if (o.auctionDate === null || o.tenor.group === null || o.rate === null) return false;
  if (o.quality.rate.presence !== "published") return false;
  const status = o.quality.rate.status;
  return status === "valid" || (options.includeSuspicious === true && status === "suspicious");
}