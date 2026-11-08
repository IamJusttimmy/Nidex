import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, summarizeNtb } from "../index";
import { rec } from "./helpers";

function sample() {
  return buildNtbQualityReport([
    rec({ id: 1 }), // clean
    rec({ id: 2, auctionDate: "March-11-2026", maturityDate: "June-10-2026", trueYield: "0.0000" }), // yield not published
    rec({ id: 3, auctionDate: "March-18-2026", maturityDate: "June-17-2026", totalSubscription: "10.0000", totalSuccessful: "20.0000" }), // allotment problem
    rec({ id: 4, auctionDate: "March-25-2026", maturityDate: "March-25-2026" }), // invalid maturity
    rec({ id: 5, auctionDate: "April-01-2026", maturityDate: "June-30-2026", trueYield: "0.0000", tenor: "91 DAY" }), // 90 days, yield not published
    rec({ id: 6 }), // exact duplicate of 1 -> rejected
  ]);
}

describe("summarizeNtb", () => {
  it("counts source records, observations and rejections", () => {
    const s = summarizeNtb(sample());
    expect(s).toMatchObject({ sourceRecords: 6, observations: 5, rejected: 1 });
  });
  it("counts records by their worst field status", () => {
    expect(summarizeNtb(sample()).recordsByWorstStatus).toEqual({ valid: 3, suspicious: 1, invalid: 1 });
  });
  it("counts statuses and presence per field", () => {
    const s = summarizeNtb(sample());
    expect(s.byField.trueYield).toMatchObject({ valid: 5, suspicious: 0, invalid: 0, notPublished: 2 });
    expect(s.byField.maturityDate).toMatchObject({ valid: 4, invalid: 1 });
    expect(s.byField.totalSuccessful.suspicious).toBe(1);
  });
  it("counts how many records each rule touched, once per record, with dates and sample ids", () => {
    const s = summarizeNtb(sample());
    const zero = s.reasons.find((r) => r.field === "trueYield" && r.code === "not_published_zero");
    expect(zero).toMatchObject({ records: 2, status: "valid", firstDate: "2026-03-11", lastDate: "2026-04-01", sampleIds: [2, 5] });
    const allot = s.reasons.filter((r) => r.code === "allotment_exceeds_subscription");
    expect(allot.map((r) => [r.field, r.records]).sort()).toEqual([["totalSubscription", 1], ["totalSuccessful", 1]]);
    expect(s.reasons.find((r) => r.code === "maturity_not_after_auction")).toMatchObject({ records: 1, status: "invalid", sampleIds: [4] });
  });
  it("counts warnings by code", () => {
    const r = buildNtbQualityReport([rec({ id: 1, successfulBidRates: "15.0000 - 15.9000" })]);
    expect(summarizeNtb(r).warnings).toEqual({ rate_differs_from_top_successful_bid: 1 });
  });
  it("lists reasons from the most to the least common", () => {
    const counts = summarizeNtb(sample()).reasons.map((r) => r.records);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });
});