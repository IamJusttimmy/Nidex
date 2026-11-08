import { describe, expect, it } from "vitest";
import { buildNtbQualityReport } from "../../quality";
import { rec } from "../../quality/__tests__/helpers";
import { checkNotRegressing, checkQuality, checkStructure, parseResponseBody, PublishRefusal, PUBLISH_LIMITS } from "../index";
import { feed, SMALL, text } from "./feed";

const refusal = (fn: () => unknown): PublishRefusal => {
  try {
    fn();
  } catch (e) {
    if (e instanceof PublishRefusal) return e;
    throw e;
  }
  throw new Error("expected a PublishRefusal, but nothing was thrown");
};

describe("parseResponseBody", () => {
  it("returns the records for a JSON array", () => {
    expect(parseResponseBody(text(feed(3)))).toHaveLength(3);
    expect(parseResponseBody("  [] \n")).toEqual([]);
  });
  it("refuses an empty body", () => {
    expect(refusal(() => parseResponseBody("")).code).toBe("empty_response");
    expect(refusal(() => parseResponseBody("  \n ")).code).toBe("empty_response");
  });
  it("refuses an HTML page, such as a security challenge", () => {
    expect(refusal(() => parseResponseBody("<!DOCTYPE html><html><title>Just a moment...</title></html>")).code).toBe("html_response");
    expect(refusal(() => parseResponseBody("\n  <html>")).code).toBe("html_response");
  });
  it("refuses text that is not JSON, including a cut-off download", () => {
    expect(refusal(() => parseResponseBody("Access denied")).code).toBe("not_json");
    expect(refusal(() => parseResponseBody(text(feed(3)).slice(0, -20))).code).toBe("not_json");
  });
  it("refuses JSON that is not a list", () => {
    expect(refusal(() => parseResponseBody('{"data": []}')).code).toBe("not_an_array");
    expect(refusal(() => parseResponseBody("null")).code).toBe("not_an_array");
    expect(refusal(() => parseResponseBody('"[]"')).code).toBe("not_an_array");
  });
});

describe("checkStructure", () => {
  it("accepts a full feed", () => {
    expect(() => checkStructure(feed(20), SMALL)).not.toThrow();
  });
  it("refuses a short list under the real limit", () => {
    expect(refusal(() => checkStructure(feed(20), PUBLISH_LIMITS)).code).toBe("too_few_records");
    expect(refusal(() => checkStructure([], PUBLISH_LIMITS)).code).toBe("too_few_records");
  });
  it("accepts a real-sized feed under the real limit", () => {
    expect(() => checkStructure(feed(PUBLISH_LIMITS.minRecords), PUBLISH_LIMITS)).not.toThrow();
  });
  it("refuses a feed where a field was renamed, and says which", () => {
    const renamed = feed(20).map(({ rate, ...rest }) => ({ ...rest, rateValue: rate }));
    const e = refusal(() => checkStructure(renamed, SMALL));
    expect(e.code).toBe("unexpected_fields");
    expect(e.message).toContain("rate (missing in 20)");
  });
  it("tolerates a stray record that is missing fields, within the coverage limit", () => {
    const limits = { ...SMALL, minFieldCoverage: 0.9 };
    const records: unknown[] = [...feed(30), { id: 999 }];
    expect(() => checkStructure(records, limits)).not.toThrow();
    expect(refusal(() => checkStructure(records, { ...SMALL, minFieldCoverage: 1 })).code).toBe("unexpected_fields");
  });
  it("refuses a list of things that are not records", () => {
    expect(refusal(() => checkStructure(Array.from({ length: 10 }, () => "x"), SMALL)).code).toBe("unexpected_fields");
  });
});

describe("checkQuality", () => {
  it("accepts a clean feed", () => {
    expect(() => checkQuality(buildNtbQualityReport(feed(30)), SMALL)).not.toThrow();
  });
  it("accepts the real level of rejections and invalid fields (one rejection in a feed of 100)", () => {
    const records = [...feed(100), { ...feed(1)[0]!, id: 5000 }]; // an exact duplicate: one rejection, 0.99%
    const report = buildNtbQualityReport(records);
    expect(report.rejected).toHaveLength(1);
    expect(() => checkQuality(report, SMALL)).not.toThrow();
  });
  it("refuses a feed where many records are rejected, for example a changed security type", () => {
    const changed = feed(30).map((r) => ({ ...r, securityType: "TBILL" }));
    expect(refusal(() => checkQuality(buildNtbQualityReport(changed), SMALL)).code).toBe("too_many_rejected");
  });
  it("refuses a feed where many records have an invalid field, for example a changed date format", () => {
    const changed = feed(30).map((r) => ({ ...r, auctionDate: "2025-01-01" }));
    expect(refusal(() => checkQuality(buildNtbQualityReport(changed), SMALL)).code).toBe("too_many_invalid");
  });
  it("refuses an empty result", () => {
    expect(refusal(() => checkQuality(buildNtbQualityReport([]), SMALL)).code).toBe("too_many_rejected");
  });
  it("uses the limits it is given", () => {
    const one = [...feed(9), rec({ id: 9000, rate: "abc", auctionDate: "March-04-2026" })];
    const report = buildNtbQualityReport(one);
    expect(() => checkQuality(report, { ...SMALL, maxInvalidShare: 0.2 })).not.toThrow();
    expect(refusal(() => checkQuality(report, { ...SMALL, maxInvalidShare: 0.05 })).code).toBe("too_many_invalid");
  });
});

describe("checkNotRegressing", () => {
  const previous = { recordCount: 1000, lastAuctionDate: "2026-11-04" };
  it("accepts growth and an equal or newer latest auction", () => {
    expect(() => checkNotRegressing({ recordCount: 1003, lastAuctionDate: "2026-11-18" }, previous)).not.toThrow();
    expect(() => checkNotRegressing({ recordCount: 1000, lastAuctionDate: "2026-11-04" }, previous)).not.toThrow();
  });
  it("accepts a small drop within the allowed share", () => {
    expect(() => checkNotRegressing({ recordCount: 985, lastAuctionDate: "2026-11-04" }, previous)).not.toThrow();
  });
  it("refuses a larger drop", () => {
    expect(refusal(() => checkNotRegressing({ recordCount: 900, lastAuctionDate: "2026-11-04" }, previous)).code).toBe("dataset_shrunk");
  });
  it("refuses a newest auction older than before, or one with no readable date", () => {
    expect(refusal(() => checkNotRegressing({ recordCount: 1000, lastAuctionDate: "2026-10-21" }, previous)).code).toBe("latest_date_older");
    expect(refusal(() => checkNotRegressing({ recordCount: 1000, lastAuctionDate: null }, previous)).code).toBe("latest_date_older");
  });
  it("can be overridden deliberately", () => {
    expect(() => checkNotRegressing({ recordCount: 10, lastAuctionDate: "2001-01-01" }, previous, { allowRegression: true })).not.toThrow();
  });
});