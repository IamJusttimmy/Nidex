import { describe, expect, it } from "vitest";
import { buildQualityReport } from "../quality";
import {
  addDays,
  cutoffFor,
  flagLines,
  inRange,
  latestValues,
  recentRows,
  summarize,
} from "../series";

function report(rows: [string, string, string, string][]) {
  const csv = "date,code,buy,mid,sell\n" + rows.map(([d, b, m, s]) => `${d},USD,${b},${m},${s}`).join("\n") + "\n";
  return buildQualityReport(csv).observations;
}

/** 8 clean days 1000..1007, buy+1 = sell. */
const clean: [string, string, string, string][] = Array.from({ length: 8 }, (_, i) => [
  `2024-01-${String(i + 1).padStart(2, "0")}`,
  String(1000 + i),
  String(1000.5 + i),
  String(1001 + i),
]);

describe("dates and ranges", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
  it("measures a range back from the latest observation", () => {
    expect(cutoffFor("1M", "2026-11-05")).toBe("2026-10-06");
    expect(cutoffFor("All", "2026-11-05")).toBeNull();
  });
  it("keeps points from the cutoff on", () => {
    const pts = [{ date: "2024-01-01" }, { date: "2024-01-05" }, { date: "2024-01-09" }];
    expect(inRange(pts, "2024-01-05").map((p) => p.date)).toEqual(["2024-01-05", "2024-01-09"]);
    expect(inRange(pts, null)).toHaveLength(3);
  });
});

describe("latestValues", () => {
  it("returns the newest clean quote with its change against the previous one", () => {
    const { latest, newerFlagged } = latestValues(report(clean));
    expect(latest).toMatchObject({ date: "2024-01-08", buy: 1007, sell: 1008, spread: 1, previousDate: "2024-01-07", buyChange: 1 });
    expect(latest!.buyChangePct).toBeCloseTo(0.0999, 3);
    expect(newerFlagged).toBeNull();
  });
  it("skips a flagged newest observation and says it was skipped", () => {
    const rows = [...clean, ["2024-01-09", "5000", "5000.5", "5001"] as [string, string, string, string]];
    // the spike has no next day, so it cannot be judged: add a clean day after it
    rows.push(["2024-01-10", "1009", "1009.5", "1010"]);
    const { latest, newerFlagged } = latestValues(report(rows));
    expect(latest!.date).toBe("2024-01-10");
    expect(newerFlagged).toBeNull();
    const withBadLast = report([...clean, ["2024-01-09", "1010", "1009.5", "1008"]]); // buy above sell
    const r = latestValues(withBadLast);
    expect(r.latest!.date).toBe("2024-01-08");
    expect(r.newerFlagged!.date).toBe("2024-01-09");
  });
  it("returns nothing when no observation passes the checks", () => {
    expect(latestValues([])).toEqual({ latest: null, newerFlagged: null });
  });
});

describe("summarize", () => {
  it("finds highs and lows among checked values only, and counts every observation", () => {
    const rows = [
      ...clean.slice(0, 3),
      ["2024-01-04", "9999", "9999.5", "10000"] as [string, string, string, string],
      ...clean.slice(4),
    ];
    const s = summarize(report(rows));
    expect(s.high).toEqual({ value: 1007, date: "2024-01-08" });
    expect(s.low).toEqual({ value: 1000, date: "2024-01-01" });
    expect(s.since).toBe("2024-01-01");
    expect(s.total).toBe(8);
    expect(s.valid + s.suspicious + s.invalid).toBe(8);
    expect(s.valid).toBeLessThan(8);
  });
});

describe("recentRows", () => {
  it("lists the newest first with the change against the previous checked value", () => {
    const rows = recentRows(report(clean), 3);
    expect(rows.map((r) => r.date)).toEqual(["2024-01-08", "2024-01-07", "2024-01-06"]);
    expect(rows[0]).toMatchObject({ buy: 1007, buyChange: 1, flagged: false });
  });
  it("shows suspicious rows with a warning and leaves out invalid ones", () => {
    const rows = report([
      ...clean.slice(0, 3),
      ["2024-01-04", "1500", "1500.5", "1501"], // coherent spike: suspicious
      ["2024-01-05", "1004", "1004.5", "1005"],
      ["2024-01-06", "1010", "1009.5", "1008"], // buy above sell: invalid
      ["2024-01-07", "1006", "1006.5", "1007"],
    ]);
    const recent = recentRows(rows, 10);
    const byDay = Object.fromEntries(recent.map((r) => [r.date.slice(8), r]));
    expect(byDay["04"].flagged).toBe(true);
    expect(byDay["04"].buyChange).toBeNull();
    expect(byDay["06"]).toBeUndefined();
    expect(byDay["05"].buyChange).toBe(2); // against 1002, skipping the flagged day
  });
});

describe("flagLines", () => {
  it("describes each non-valid field in plain words", () => {
    const rows = report([...clean.slice(0, 3), ["2024-01-04", "1010", "1009.5", "1008"], ...clean.slice(4)]);
    const o = rows.find((r) => r.date === "2024-01-04")!;
    const lines = flagLines(o);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ label: "Buying and selling", status: "invalid" });
    expect(lines[0].message).toContain("buying price is higher");
  });
});