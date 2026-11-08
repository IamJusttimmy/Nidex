import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, classifyRecord, type NtbObservation } from "../index";
import { codes } from "./helpers";
import { REAL } from "./real-fixtures";

const c = (id: number): NtbObservation => classifyRecord(REAL[id]!);

describe("real CBN records (regression)", () => {
  it("2002 record: 91-day bill with a ~182-day maturity date. The date is questioned, the yield supports the tenor", () => {
    const o = c(10);
    expect(o.tenor.group).toBe(91);
    expect(o.daysToMaturity).toBe(182);
    expect(o.quality.maturityDate.status).toBe("suspicious");
    expect(o.quality.maturityDate.reasons[0]?.detail?.yieldFitsTenor).toBe(true);
    expect(o.maturityDate).toBe("2002-07-04"); // published value untouched
    expect(o.quality.rate.status).toBe("valid");
    expect(o.quality.trueYield.status).toBe("valid");
    expect(o.rateLabel).toEqual({ raw: "Issue Rates", display: "Issue" });
  });
  it("the identical pair 3920/3921: the first is kept, the second is rejected and kept on file", () => {
    const r = buildNtbQualityReport([REAL[3920], REAL[3921]]);
    expect(r.observations.map((o) => o.id)).toEqual([3920]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ id: 3921, kind: "duplicate_content" });
  });
  it("4586: a corrupted successful range (196300) is invalid; the rate and the bid range are still usable", () => {
    const o = c(4586);
    expect(o.quality.successfulBidRates.status).toBe("invalid");
    expect(codes(o, "successfulBidRates")).toContain("bid_rate_implausible");
    expect(o.quality.rangeBid.status).toBe("valid");
    expect(o.quality.rate.status).toBe("valid");
    expect(o.rate).toBe(19.63);
    expect(o.quality.trueYield).toMatchObject({ status: "valid", presence: "not-published" });
  });
  it("4547: a holiday-week '90 DAY' label is grouped with the 91-day bills", () => {
    const o = c(4547);
    expect(o.tenor).toMatchObject({ rawText: "90 DAY", labelDays: 90, group: 91 });
    expect(o.quality.maturityDate.status).toBe("valid");
    expect(codes(o, "tenor")).toEqual(["tenor_label_variant"]);
  });
  it("6889: '365Day' is grouped with the 364-day bills", () => {
    const o = c(6889);
    expect(o.tenor.group).toBe(364);
    expect(o.quality.maturityDate.status).toBe("valid");
  });
  it("6849: a true yield that just repeats the rate is questioned, not replaced", () => {
    const o = c(6849);
    expect(o.rate).toBe(17.59);
    expect(o.trueYield).toBe(17.59);
    expect(o.quality.trueYield.status).toBe("suspicious");
    expect(codes(o, "trueYield")).toEqual(["true_yield_inconsistent_with_rate"]);
  });
  it("4399: a reversed successful range is invalid", () => {
    expect(codes(c(4399), "successfulBidRates")).toContain("bid_range_reversed");
  });
  it("898: a tenor written as '3' is flagged and has no group; the rest of the record is judged normally", () => {
    const o = c(898);
    expect(o.quality.tenor.status).toBe("suspicious");
    expect(o.tenor.group).toBeNull();
    expect(o.quality.rate.status).toBe("valid");
  });
  it("4811: a maturity date equal to the auction date is invalid, the rate is untouched", () => {
    const o = c(4811);
    expect(o.quality.maturityDate.status).toBe("invalid");
    expect(o.quality.rate.status).toBe("valid");
  });
  it("901: an all-zero placeholder row has no published values, and none are turned into zero", () => {
    const o = c(901);
    for (const f of ["rate", "trueYield", "amtOffered", "totalSubscription", "totalSuccessful", "rangeBid", "successfulBidRates"] as const) {
      expect(o.quality[f].presence, f).toBe("not-published");
    }
    expect([o.rate, o.trueYield, o.amtOffered, o.totalSubscription, o.totalSuccessful]).toEqual([null, null, null, null, null]);
    expect(o.raw.rate).toBe("0.0000");
  });
  it("4421: a ~183-day maturity on a 91-day bill is questioned; with no yield published, no claim is made about it", () => {
    const o = c(4421);
    expect(o.quality.maturityDate.status).toBe("suspicious");
    expect(o.quality.maturityDate.reasons[0]?.detail?.yieldFitsTenor).toBeNull();
  });
});