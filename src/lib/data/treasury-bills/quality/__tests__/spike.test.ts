import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, DEFAULT_RULES, type NtbObservation } from "../index";
import { addDaysIso, cbnDate, rec, series91 } from "./helpers";

const flaggedIds = (obs: NtbObservation[]) =>
  obs.filter((o) => o.quality.rate.reasons.some((r) => r.code === "rate_spike_reversion")).map((o) => o.id);

describe("rate_spike_reversion", () => {
  it("flags a rate that jumps and returns at the next auction", () => {
    const { observations } = buildNtbQualityReport(series91([15, 15.2, 8, 15.1, 15.3]));
    expect(flaggedIds(observations)).toEqual([102]);
    const o = observations.find((x) => x.id === 102)!;
    expect(o.quality.rate.status).toBe("suspicious");
    expect(o.rate).toBe(8); // never changed
    expect(o.quality.rate.reasons.at(-1)?.detail).toMatchObject({ rate: 8, previous: 15.2, next: 15.1 });
  });
  it("flags an upward spike too", () => {
    expect(flaggedIds(buildNtbQualityReport(series91([15, 15.2, 22, 15.1, 15.3])).observations)).toEqual([102]);
  });
  it("does not flag a genuine step that stays", () => {
    expect(flaggedIds(buildNtbQualityReport(series91([15, 15.2, 8, 8.1, 8.2])).observations)).toEqual([]);
  });
  it("does not flag a move that only partly comes back", () => {
    // jump 7.2 points; the next auction is back only 40% of the way
    expect(flaggedIds(buildNtbQualityReport(series91([15, 15.2, 8, 11, 11.2])).observations)).toEqual([]);
  });
  it("does not flag a move smaller than the minimum number of points", () => {
    expect(flaggedIds(buildNtbQualityReport(series91([15, 15.2, 12.5, 15.1, 15.3])).observations)).toEqual([]);
  });
  it("does not flag a move that is large in points but small relative to the rate", () => {
    // 3.1 points but only 15% of the previous rate
    expect(flaggedIds(buildNtbQualityReport(series91([20, 20.2, 23.3, 20.1, 20.3])).observations)).toEqual([]);
  });
  it("does not treat tiny rates as spikes (rates near zero in 2020)", () => {
    expect(flaggedIds(buildNtbQualityReport(series91([0.035, 0.048, 0.5, 0.04, 0.045])).observations)).toEqual([]);
  });
  it("never flags the first or last auction of a series", () => {
    expect(flaggedIds(buildNtbQualityReport(series91([5, 15, 15.1, 15.2, 5])).observations)).toEqual([]);
  });
  it("judges each tenor on its own", () => {
    const records = [...series91([15, 15.2, 8, 15.1, 15.3], "2025-01-01", 91), ...series91([18, 18.2, 18.1, 18.3, 18.2], "2025-01-01", 182).map((r) => ({ ...r, id: r.id + 1000 }))];
    expect(flaggedIds(buildNtbQualityReport(records).observations)).toEqual([102]);
  });
  it("skips a neighbour whose rate already failed another check and uses the previous valid one", () => {
    const records = series91([15, 15.2, 8, 15.1, 15.3]);
    records[1] = { ...records[1]!, rate: "154.0000" }; // invalid (above 100%)
    expect(flaggedIds(buildNtbQualityReport(records).observations)).toEqual([102]);
  });
  it("does not judge a rate that already failed another check", () => {
    const records = series91([15, 15.2, 8, 15.1, 15.3]);
    records[2] = { ...records[2]!, rate: "800.0000" };
    const { observations } = buildNtbQualityReport(records);
    expect(flaggedIds(observations)).toEqual([]);
    expect(observations.find((o) => o.id === 102)?.quality.rate.reasons.map((r) => r.code)).toContain("rate_implausible");
  });
  it("ignores records that are not published or have no tenor group", () => {
    const records = series91([15, 15.2, 8, 15.1, 15.3]);
    records[2] = { ...records[2]!, rate: "0.0000", trueYield: "0.0000" };
    expect(flaggedIds(buildNtbQualityReport(records).observations)).toEqual([]);
  });
  it("respects the thresholds in the rules", () => {
    const loose = { ...DEFAULT_RULES, spikeMinJumpPoints: 1, spikeMinJumpRatio: 0.05 };
    expect(flaggedIds(buildNtbQualityReport(series91([15, 15.2, 12.5, 15.1, 15.3]), loose).observations)).toEqual([102]);
  });
  it("keeps a spike flag out of the other fields", () => {
    const o = buildNtbQualityReport(series91([15, 15.2, 8, 15.1, 15.3])).observations.find((x) => x.id === 102)!;
    expect(o.quality.tenor.status).toBe("valid");
    expect(o.quality.maturityDate.status).toBe("valid");
    expect(o.quality.totalSuccessful.status).toBe("valid");
  });
  it("orders by date, not by position in the file", () => {
    const records = series91([15, 15.2, 8, 15.1, 15.3]).reverse();
    expect(flaggedIds(buildNtbQualityReport(records).observations)).toEqual([102]);
    // the helper dates are 14 days apart
    expect(addDaysIso("2025-01-01", 14)).toBe("2025-01-15");
    expect(cbnDate("2025-01-15")).toBe("January-15-2025");
    expect(rec().id).toBe(1);
  });
});