import { describe, expect, it } from "vitest";
import {
  daysBetween,
  expectedTrueYield,
  parseBidRange,
  parseCbnDate,
  parseNumber,
  parseTenorDays,
  standardiseRateLabel,
} from "../parse";

describe("parseNumber", () => {
  it("separates empty, zero, numbers and unreadable text", () => {
    expect(parseNumber("")).toEqual({ kind: "empty" });
    expect(parseNumber("   ")).toEqual({ kind: "empty" });
    expect(parseNumber("0.0000")).toEqual({ kind: "zero" });
    expect(parseNumber("0")).toEqual({ kind: "zero" });
    expect(parseNumber("15.4000")).toEqual({ kind: "number", value: 15.4 });
    expect(parseNumber(" 100000.0000 ")).toEqual({ kind: "number", value: 100000 });
    expect(parseNumber("-2.5")).toEqual({ kind: "number", value: -2.5 });
    expect(parseNumber("12 8000")).toEqual({ kind: "unparseable" });
    expect(parseNumber("1,234.5")).toEqual({ kind: "unparseable" });
    expect(parseNumber("abc")).toEqual({ kind: "unparseable" });
  });
});

describe("parseCbnDate", () => {
  it("reads CBN dates into ISO dates", () => {
    expect(parseCbnDate("November-04-2026")).toBe("2026-11-04");
    expect(parseCbnDate("january-03-2002")).toBe("2002-01-03");
    expect(parseCbnDate(" March-4-2026 ")).toBe("2026-03-04");
  });
  it("rejects impossible or unreadable dates", () => {
    expect(parseCbnDate("February-30-2024")).toBeNull();
    expect(parseCbnDate("Smarch-04-2026")).toBeNull();
    expect(parseCbnDate("2026-11-04")).toBeNull();
    expect(parseCbnDate("")).toBeNull();
  });
  it("counts days between dates, negative when going back", () => {
    expect(daysBetween("2026-03-04", "2026-06-03")).toBe(91);
    expect(daysBetween("2026-06-03", "2026-03-04")).toBe(-91);
  });
});

describe("parseTenorDays", () => {
  it("reads the many ways CBN writes a tenor", () => {
    for (const t of ["91DAY", "91Day", "91 DAY", "91 DAYS", "91 Days", "91", "91 ", " 182 Day "]) {
      expect(parseTenorDays(t)).not.toBeNull();
    }
    expect(parseTenorDays("91DAY")).toBe(91);
    expect(parseTenorDays("364 Days")).toBe(364);
    expect(parseTenorDays("90 DAY")).toBe(90);
  });
  it("returns null for anything that is not a number of days", () => {
    expect(parseTenorDays("")).toBeNull();
    expect(parseTenorDays("abc")).toBeNull();
    expect(parseTenorDays("91-182")).toBeNull();
  });
});

describe("parseBidRange", () => {
  it("reads the common formats", () => {
    expect(parseBidRange("15.0000 - 15.4000")).toEqual({ kind: "range", low: 15, high: 15.4 });
    expect(parseBidRange("15.0000-15.4000")).toEqual({ kind: "range", low: 15, high: 15.4 });
    expect(parseBidRange("19.5000 %  -  21.0000 %")).toEqual({ kind: "range", low: 19.5, high: 21 });
    expect(parseBidRange("19.7500%-20.7500%")).toEqual({ kind: "range", low: 19.75, high: 20.75 });
    expect(parseBidRange("9.2500– 11.0000")).toEqual({ kind: "range", low: 9.25, high: 11 });
  });
  it("reads a lone rate as a single value", () => {
    expect(parseBidRange("14.4900%")).toEqual({ kind: "single", value: 14.49 });
    expect(parseBidRange("15.4")).toEqual({ kind: "single", value: 15.4 });
  });
  it("treats empty and 0 as not published", () => {
    expect(parseBidRange("")).toEqual({ kind: "empty" });
    expect(parseBidRange("0")).toEqual({ kind: "zero" });
  });
  it("does not guess at corrupted text", () => {
    expect(parseBidRange("12 8000")).toEqual({ kind: "unparseable" });
    expect(parseBidRange("3.3880 - 12 8000")).toEqual({ kind: "unparseable" });
    expect(parseBidRange("21.1900-20.5000\r\n22.5000")).toEqual({ kind: "unparseable" });
    expect(parseBidRange("2.1.000 % - 22.5000 %")).toEqual({ kind: "unparseable" });
    expect(parseBidRange("12.0000% - ")).toEqual({ kind: "unparseable" });
  });
  it("returns corrupted-but-readable numbers as written, so the checks can judge them", () => {
    expect(parseBidRange("2.2170-60000")).toEqual({ kind: "range", low: 2.217, high: 60000 });
  });
});

describe("standardiseRateLabel", () => {
  it("fixes typos and wording only", () => {
    expect(standardiseRateLabel("Issue")).toBe("Issue");
    expect(standardiseRateLabel("Issue Rates")).toBe("Issue");
    expect(standardiseRateLabel("Maginal")).toBe("Marginal");
    expect(standardiseRateLabel("Slop")).toBe("Stop");
    expect(standardiseRateLabel(" stop ")).toBe("Stop");
  });
  it("returns null for labels it does not know", () => {
    expect(standardiseRateLabel("Weighted average")).toBeNull();
    expect(standardiseRateLabel("")).toBeNull();
  });
});

describe("expectedTrueYield", () => {
  it("agrees with CBN's published true yield for real 2002 auctions to within 0.005 points", () => {
    expect(expectedTrueYield(20.75, 91)).toBeCloseTo(21.8813, 2); // record 10
    expect(expectedTrueYield(21, 91)).toBeCloseTo(22.1612, 2); // record 12
  });
  it("is almost the rate itself for tiny rates", () => {
    expect(expectedTrueYield(0.035, 91).toFixed(4)).toBe("0.0350");
  });
});