import { classifyRecord, DEFAULT_RULES, expectedTrueYield, type NtbObservation, type NtbRules, type RawNtbRecord, type RawTextField } from "../index";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 2026-03-04 -> "March-04-2026" (the way CBN writes dates). */
export function cbnDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1]}-${d}-${y}`;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A record where every field is clean. Override fields to test one rule at a time. */
export function rec(over: Partial<Record<RawTextField, string>> & { id?: number } = {}): RawNtbRecord {
  return {
    id: 1,
    auctionDate: "March-04-2026",
    securityType: "NTB",
    tenor: "91DAY",
    auctionNo: "04-03-2026 91DAY",
    auction: "Primary Market",
    week: "1st Week",
    maturityDate: "June-03-2026",
    totalSubscription: "25010.9220",
    totalSuccessful: "22395.2720",
    rangeBid: "15.0000 - 16.1500",
    successfulBidRates: "15.0000 - 15.4000",
    rateDescription: "Issue",
    rate: "15.4000",
    trueYield: "16.0149",
    amtOffered: "100000.0000",
    totalAmtRepaid: "0.0000",
    netType: "Sales",
    netValue: "22395.2720",
    ...over,
  };
}

export function classify(over: Partial<Record<RawTextField, string>> & { id?: number } = {}, rules: NtbRules = DEFAULT_RULES): NtbObservation {
  return classifyRecord(rec(over), rules);
}

export function codes(o: NtbObservation, field: keyof NtbObservation["quality"]): string[] {
  return o.quality[field].reasons.map((r) => r.code);
}

/**
 * One 91-day auction per week with an otherwise clean record, so only the rate series matters.
 * Maturity, yield and bid ranges are built to be consistent with each rate.
 */
export function series91(rates: number[], startIso = "2025-01-01", tenorDays: 91 | 182 | 364 = 91): RawNtbRecord[] {
  return rates.map((rate, i) => {
    const date = addDaysIso(startIso, i * 14);
    return rec({
      id: 100 + i,
      auctionDate: cbnDate(date),
      maturityDate: cbnDate(addDaysIso(date, tenorDays)),
      tenor: `${tenorDays}DAY`,
      rate: rate.toFixed(4),
      trueYield: expectedTrueYield(rate, tenorDays).toFixed(4),
      rangeBid: `${(rate - 1).toFixed(4)} - ${(rate + 1).toFixed(4)}`,
      successfulBidRates: `${(rate - 0.5).toFixed(4)} - ${rate.toFixed(4)}`,
    });
  });
}