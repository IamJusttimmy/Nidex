import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, RAW_TEXT_FIELDS } from "../index";
import { rec } from "./helpers";

describe("buildNtbQualityReport: structure", () => {
  it("requires an array", () => {
    expect(() => buildNtbQualityReport({ rows: [] })).toThrow(/array/);
    expect(() => buildNtbQualityReport("[]")).toThrow(/array/);
  });
  it("returns nothing for an empty array", () => {
    expect(buildNtbQualityReport([])).toMatchObject({ sourceCount: 0, observations: [], rejected: [] });
  });
  it("records the rules version", () => {
    expect(buildNtbQualityReport([rec()]).rulesVersion).toBe("2026-11-08.1");
  });
  it("accounts for every source record: observations plus rejected equals the source count", () => {
    const input = [rec({ id: 1 }), rec({ id: 1 }), "text", null, { id: "x" }, rec({ id: 2, securityType: "OMO" }), rec({ id: 3 })];
    const r = buildNtbQualityReport(input);
    expect(r.sourceCount).toBe(7);
    expect(r.observations.length + r.rejected.length).toBe(7);
  });
});

describe("buildNtbQualityReport: rejections are kept and explained", () => {
  it("rejects entries that are not records", () => {
    const r = buildNtbQualityReport(["x", null, [1, 2]]);
    expect(r.rejected.map((x) => x.kind)).toEqual(["not_an_object", "not_an_object", "not_an_object"]);
    expect(r.rejected.map((x) => x.index)).toEqual([0, 1, 2]);
  });
  it("rejects a record without a whole-number id", () => {
    const bad = { ...rec(), id: 1.5 };
    const r = buildNtbQualityReport([bad, { ...rec(), id: undefined }, { ...rec(), id: "7" }]);
    expect(r.rejected.map((x) => x.kind)).toEqual(["invalid_id", "invalid_id", "invalid_id"]);
    expect(r.observations).toEqual([]);
  });
  it("rejects a repeated id and keeps the first", () => {
    const r = buildNtbQualityReport([rec({ id: 5, rate: "15.4000" }), rec({ id: 5, rate: "16.0000" })]);
    expect(r.observations.map((o) => o.raw.rate)).toEqual(["15.4000"]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ id: 5, kind: "duplicate_id", index: 1 });
  });
  it("rejects records that are not Treasury bills", () => {
    const r = buildNtbQualityReport([rec({ id: 1, securityType: "OMO" }), rec({ id: 2, securityType: "ntb " }), rec({ id: 3, securityType: "" })]);
    expect(r.observations.map((o) => o.id)).toEqual([2]);
    expect(r.rejected.map((x) => x.kind)).toEqual(["security_type_not_ntb", "security_type_not_ntb"]);
  });
  it("rejects an exact duplicate (same content, different id) and keeps the first", () => {
    const r = buildNtbQualityReport([rec({ id: 10 }), rec({ id: 11 })]);
    expect(r.observations.map((o) => o.id)).toEqual([10]);
    expect(r.rejected[0]).toMatchObject({ id: 11, kind: "duplicate_content" });
    expect(r.rejected[0]?.message).toContain("record 10");
  });
  it("keeps the rejected record exactly as received", () => {
    const original = rec({ id: 11 });
    const r = buildNtbQualityReport([rec({ id: 10 }), original]);
    expect(r.rejected[0]?.raw).toBe(original);
  });
});

describe("buildNtbQualityReport: same auction, different content", () => {
  it("keeps both and warns on both (conflicting_duplicate_auction)", () => {
    const r = buildNtbQualityReport([rec({ id: 1, rate: "15.4000" }), rec({ id: 2, rate: "15.5000", totalSubscription: "999.0000" })]);
    expect(r.observations).toHaveLength(2);
    for (const o of r.observations) {
      expect(o.warnings.map((w) => w.code)).toContain("conflicting_duplicate_auction");
    }
  });
  it("does not warn for different tenors on the same day", () => {
    const r = buildNtbQualityReport([
      rec({ id: 1 }),
      rec({ id: 2, tenor: "182DAY", maturityDate: "September-02-2026" }),
    ]);
    expect(r.observations.flatMap((o) => o.warnings.map((w) => w.code))).not.toContain("conflicting_duplicate_auction");
  });
});

describe("buildNtbQualityReport: input handling", () => {
  it("reads null and missing text fields as empty, not as errors", () => {
    const partial = { ...rec(), trueYield: null, netType: undefined } as unknown;
    const r = buildNtbQualityReport([partial]);
    expect(r.observations[0]?.raw.trueYield).toBe("");
    expect(r.observations[0]?.raw.netType).toBe("");
    expect(r.observations[0]?.quality.trueYield.presence).toBe("not-published");
  });
  it("turns a numeric value into text so the same rules apply", () => {
    const r = buildNtbQualityReport([{ ...rec(), rate: 15.4 } as unknown]);
    expect(r.observations[0]?.raw.rate).toBe("15.4");
    expect(r.observations[0]?.rate).toBe(15.4);
  });
  it("ignores fields it does not know without failing", () => {
    const r = buildNtbQualityReport([{ ...rec(), extra: "x" } as unknown]);
    expect(r.observations).toHaveLength(1);
    expect(Object.keys(r.observations[0]!.raw).sort()).toEqual(["id", ...RAW_TEXT_FIELDS].sort());
  });
  it("never changes the input", () => {
    const input = [rec({ id: 1, tenor: "91 DAYS ", rateDescription: "Slop" }), rec({ id: 2, trueYield: "0.0000", auctionDate: "March-11-2026", maturityDate: "June-10-2026" })];
    const snapshot = JSON.parse(JSON.stringify(input));
    input.forEach((r) => Object.freeze(r));
    Object.freeze(input);
    buildNtbQualityReport(input);
    expect(input).toEqual(snapshot);
  });
  it("does not drop a record because one field is invalid", () => {
    const r = buildNtbQualityReport([rec({ id: 1, auctionDate: "nonsense", maturityDate: "", rate: "abc" })]);
    expect(r.observations).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
    expect(r.observations[0]?.quality.totalSuccessful.status).toBe("valid");
  });
});

describe("buildNtbQualityReport: order", () => {
  it("sorts by auction date, then id, with unreadable dates last", () => {
    const r = buildNtbQualityReport([
      rec({ id: 3, auctionDate: "nonsense", maturityDate: "June-03-2026" }),
      rec({ id: 2, auctionDate: "March-11-2026", maturityDate: "June-10-2026", rate: "15.5000" }),
      rec({ id: 1, auctionDate: "March-04-2026" }),
      rec({ id: 4, auctionDate: "March-04-2026", tenor: "182DAY", maturityDate: "September-02-2026" }),
    ]);
    expect(r.observations.map((o) => o.id)).toEqual([1, 4, 2, 3]);
  });
});