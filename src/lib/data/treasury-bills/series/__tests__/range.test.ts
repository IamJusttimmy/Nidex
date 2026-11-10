import { describe, expect, it } from "vitest";
import { cutoffDate, inRange, RANGES } from "../index";

describe("cutoffDate", () => {
  it("counts whole calendar years back from the newest auction", () => {
    expect(cutoffDate("1Y", "2026-11-04")).toBe("2025-11-04");
    expect(cutoffDate("5Y", "2026-11-04")).toBe("2021-11-04");
    expect(cutoffDate("10Y", "2026-11-04")).toBe("2016-11-04");
  });
  it("has no limit for All", () => {
    expect(cutoffDate("ALL", "2026-11-04")).toBeNull();
  });
  it("handles 29 February without producing an invalid date", () => {
    expect(cutoffDate("1Y", "2024-02-29")).toBe("2023-03-01");
  });
  it("gives no limit for a date it cannot read, rather than hiding data", () => {
    expect(cutoffDate("1Y", "not a date")).toBeNull();
  });
  it("offers the ranges in order, ending with All", () => {
    expect(RANGES.map((r) => r.key)).toEqual(["1Y", "5Y", "10Y", "ALL"]);
  });
});

describe("inRange", () => {
  const points = [{ date: "2020-01-01" }, { date: "2025-11-03" }, { date: "2025-11-04" }, { date: "2026-11-04" }];
  it("keeps points on or after the cutoff, in order, and does not change the input", () => {
    const copy = JSON.stringify(points);
    expect(inRange(points, "2025-11-04").map((p) => p.date)).toEqual(["2025-11-04", "2026-11-04"]);
    expect(JSON.stringify(points)).toBe(copy);
  });
  it("keeps everything for a null cutoff", () => {
    expect(inRange(points, null)).toHaveLength(4);
  });
});