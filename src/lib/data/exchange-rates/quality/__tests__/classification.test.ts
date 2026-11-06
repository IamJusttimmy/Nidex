import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../config";
import { detectReversion } from "../classify";
import { find, normalDays, run, type Row } from "./helpers";

describe("valid records", () => {
  it("leaves a normal series entirely valid with no verification needed", () => {
    const { observations } = run(normalDays(8));
    for (const o of observations) {
      expect(o.quality.buy.status).toBe("valid");
      expect(o.quality.mid.status).toBe("valid");
      expect(o.quality.sell.status).toBe("valid");
      expect(o.quality.quotePair.status).toBe("valid");
      expect(o.verification).toBe("not-required");
    }
  });
});

describe("buying price above selling price (Group A)", () => {
  const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1010", "1009.5", "1009"], ...normalDays(3, 5, "USD", 1004)];
  it("marks the quote pair invalid but does not assume either value is wrong", () => {
    const o = find(run(rows).observations, "2024-01-04");
    expect(o.quality.quotePair.status).toBe("invalid");
    expect(o.quality.quotePair.reasons[0].code).toBe("buy_above_sell");
    expect(o.quality.buy.status).toBe("valid");
    expect(o.quality.sell.status).toBe("valid");
  });
  it("preserves both original values", () => {
    const o = find(run(rows).observations, "2024-01-04");
    expect([o.buy, o.sell]).toEqual([1010, 1009]);
    expect([o.raw.buy, o.raw.sell]).toEqual(["1010", "1009"]);
  });
});

describe("single_observation_reversion", () => {
  it("normal spread, both prices jump and revert -> both suspicious (Group C)", () => {
    const rows: Row[] = [
      ...normalDays(3, 1, "USD", 840), // 840..842
      ["2024-01-04", "USD", "1038.63", "1039.13", "1039.63"],
      ["2024-01-05", "USD", "843", "843.5", "844"],
      ...normalDays(2, 6, "USD", 844),
    ];
    const o = find(run(rows).observations, "2024-01-04");
    expect(o.quality.buy.status).toBe("suspicious");
    expect(o.quality.sell.status).toBe("suspicious");
    expect(o.quality.buy.reasons[0].code).toBe("single_observation_reversion");
    expect(o.quality.quotePair.status).toBe("valid");
    expect(o.buy).toBe(1038.63);
  });

  it("abnormal spread, only one side spikes -> only that field invalid (Group B)", () => {
    const rows: Row[] = [
      ...normalDays(3), // 1000..1002
      ["2024-01-04", "USD", "1003", "5000", "9999"], // sell corrupted
      ...normalDays(3, 5, "USD", 1004),
    ];
    const o = find(run(rows).observations, "2024-01-04");
    expect(o.quality.sell.status).toBe("invalid");
    expect(o.quality.sell.reasons[0].code).toBe("single_observation_reversion_abnormal_spread");
    expect(o.quality.buy.status).toBe("valid"); // unaffected field stays usable
  });

  it("records the numbers behind the decision", () => {
    const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1003", "1003.5", "9999"], ...normalDays(3, 5, "USD", 1004)];
    const d = find(run(rows).observations, "2024-01-04").quality.sell.reasons[0].detail!;
    expect(d).toMatchObject({ previous: 1003, value: 9999, next: 1005 });
  });

  it("is not evaluated for the first or last observation (missing previous/next)", () => {
    const rows: Row[] = [["2024-01-01", "USD", "5000", "5000.5", "5001"], ...normalDays(3, 2, "USD", 1000), ["2024-01-09", "USD", "5000", "5000.5", "5001"]];
    const obs = run(rows).observations;
    expect(find(obs, "2024-01-01").quality.buy.status).toBe("valid");
    expect(find(obs, "2024-01-09").quality.buy.status).toBe("valid");
  });

  it("is not evaluated when the neighbouring value was not published", () => {
    expect(detectReversion(null, 1500, 1000, DEFAULT_RULES)).toBeNull();
    expect(detectReversion(1000, 1500, undefined, DEFAULT_RULES)).toBeNull();
    expect(detectReversion(1000, null, 1000, DEFAULT_RULES)).toBeNull();
  });

  it("does NOT flag an isolated legitimate step that persists", () => {
    // 1000 -> 1300 and STAYS at the new level, like the real USD steps of 2016-06-20 or 2024-01-30
    const rows: Row[] = [...normalDays(3), ...normalDays(5, 4, "USD", 1300)];
    const obs = run(rows).observations;
    expect(obs.every((o) => o.quality.buy.status === "valid" && o.quality.sell.status === "valid")).toBe(true);
  });

  it("does not flag a jump just under the threshold, and flags one just over", () => {
    const mk = (b: number): Row[] => [...normalDays(3), ["2024-01-04", "USD", String(b), String(b + 0.5), String(b + 1)], ...normalDays(3, 5, "USD", 1004)];
    expect(find(run(mk(1002 * 1.19)).observations, "2024-01-04").quality.buy.status).toBe("valid");
    expect(find(run(mk(1002 * 1.21)).observations, "2024-01-04").quality.buy.status).toBe("suspicious");
  });

  it("uses adjacent observations, so a gap of days does not matter", () => {
    const rows: Row[] = [...normalDays(3), ["2024-01-10", "USD", "1500", "1500.5", "1501"], ["2024-01-20", "USD", "1004", "1004.5", "1005"]];
    expect(find(run(rows).observations, "2024-01-10").quality.buy.status).toBe("suspicious");
  });

  it("a two-observation excursion is not caught (documented limitation)", () => {
    const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1500", "1500.5", "1501"], ["2024-01-05", "USD", "1500", "1500.5", "1501"], ...normalDays(2, 6, "USD", 1004)];
    const obs = run(rows).observations;
    expect(find(obs, "2024-01-04").quality.buy.status).toBe("valid");
  });
});

describe("midpoint (Group D)", () => {
  const base = (mid: string): Row[] => [...normalDays(3), ["2024-01-04", "USD", "1003", mid, "1004"], ...normalDays(3, 5, "USD", 1004)];

  it("mid inside the range is valid", () => {
    expect(find(run(base("1003.5")).observations, "2024-01-04").quality.mid.status).toBe("valid");
  });
  it("tolerates rounding: outside by no more than the rounding tolerance", () => {
    expect(find(run(base("1004.0001")).observations, "2024-01-04").quality.mid.status).toBe("valid");
    expect(find(run(base("1002.9999")).observations, "2024-01-04").quality.mid.status).toBe("valid");
  });
  it("slightly outside beyond rounding -> suspicious", () => {
    const o = find(run(base("1004.5")).observations, "2024-01-04");
    expect(o.quality.mid.status).toBe("suspicious");
    expect(o.quality.mid.reasons[0].code).toBe("mid_outside_range_minor");
  });
  it("far outside -> invalid, and buy/sell stay valid", () => {
    const o = find(run(base("10040")).observations, "2024-01-04");
    expect(o.quality.mid.status).toBe("invalid");
    expect(o.quality.mid.reasons[0].code).toBe("mid_outside_range_major");
    expect(o.quality.buy.status).toBe("valid");
    expect(o.quality.sell.status).toBe("valid");
    expect(o.quality.quotePair.status).toBe("valid");
  });
  it("the invalid/suspicious boundary is the configured fraction", () => {
    expect(find(run(base("1013")).observations, "2024-01-04").quality.mid.status).toBe("suspicious"); // 0.9% outside
    expect(find(run(base("1015")).observations, "2024-01-04").quality.mid.status).toBe("invalid"); // 1.1% outside
  });
});

describe("multiple anomalies on one record", () => {
  it("keeps every reason on its own field (abnormal-spread spike on sell plus a far-off midpoint)", () => {
    const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1003", "50000", "9999"], ...normalDays(3, 5, "USD", 1004)];
    const o = find(run(rows).observations, "2024-01-04");
    expect(o.quality.quotePair.status).toBe("valid");
    expect(o.quality.sell.reasons.map((r) => r.code)).toEqual(["single_observation_reversion_abnormal_spread"]);
    expect(o.quality.mid.reasons.map((r) => r.code)).toEqual(["mid_outside_range_major"]);
    expect(o.quality.buy.status).toBe("valid");
  });
});

describe("midpoint range check when the quote pair is invalid", () => {
  // buy above sell, and the midpoint is the 'right' value that fits the neighbouring days (like CHF 4 Aug 2022)
  const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1006", "1007.5", "1002"], ...normalDays(3, 5, "USD", 1004)];

  it("is skipped: the midpoint stays valid and the pair is invalid", () => {
    const o = find(run(rows).observations, "2024-01-04");
    expect(o.quality.quotePair.status).toBe("invalid");
    expect(o.quality.mid.status).toBe("valid");
    expect(o.quality.mid.reasons).toEqual([]);
  });
  it("is skipped even when the midpoint is far outside the reversed range", () => {
    const far: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1010", "5000", "1000"], ...normalDays(3, 5, "USD", 1004)];
    expect(find(run(far).observations, "2024-01-04").quality.mid.status).toBe("valid");
  });
  it("can be switched off, restoring the old behaviour (reversible)", () => {
    const o = find(run(rows, { ...DEFAULT_RULES, skipMidRangeCheckWhenPairInvalid: false }).observations, "2024-01-04");
    expect(o.quality.mid.status).toBe("suspicious"); // 0.15% outside the reversed range
  });
  it("still runs on every row whose quote pair is valid", () => {
    const ok: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1003", "1015", "1004"], ...normalDays(3, 5, "USD", 1004)];
    expect(find(run(ok).observations, "2024-01-04").quality.mid.status).toBe("invalid");
  });
  it("leaves the other midpoint checks running: a midpoint power-of-ten slip is still caught on an invalid-pair row's neighbours", () => {
    // the midpoint of a copied/shifted record is still promoted by the mechanical-error rule
    const gbp: Row[] = [...normalDays(3, 1, "GBP", 220), ["2024-01-04", "GBP", "2239.9", "2240.4", "2240.9"], ...normalDays(3, 5, "GBP", 223)];
    expect(find(run(gbp).observations, "2024-01-04", "GBP").quality.mid.status).toBe("invalid");
  });
  it("never changes buy, sell or the published values", () => {
    const o = find(run(rows).observations, "2024-01-04");
    expect([o.buy, o.mid, o.sell]).toEqual([1006, 1007.5, 1002]);
  });
});

describe("spread baseline", () => {
  it("is the median, so extreme corrupted rows do not move it", () => {
    const rows: Row[] = [...normalDays(9), ["2024-01-10", "USD", "1", "500000", "1000000"]];
    const { spreadBaselines } = run(rows);
    expect(spreadBaselines.USD).toBeCloseTo(1 / 1004, 4);
  });
});
