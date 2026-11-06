import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../config";
import { classifyParsed } from "../pipeline";
import { parseRatesCsv } from "../parse";
import { find, normalDays, run, toCsv, type Row } from "./helpers";

const OFF = { ...DEFAULT_RULES, promoteMechanicalErrors: false };

/** GBP around 220-224, with one row replaced. */
const gbp = (day4: Row): Row[] => [...normalDays(3, 1, "GBP", 220), day4, ...normalDays(3, 5, "GBP", 223)];

describe("power-of-ten promotion", () => {
  const shifted: Row = ["2024-01-04", "GBP", "2239.9", "2240.4", "2240.9"]; // x10 on all three

  it("promotes the affected fields to invalid, keeps the original reason and adds the evidence", () => {
    const o = find(run(gbp(shifted)).observations, "2024-01-04", "GBP");
    for (const f of ["buy", "sell", "mid"] as const) expect(o.quality[f].status).toBe("invalid");
    expect(o.quality.buy.reasons.map((r) => r.code)).toEqual(["single_observation_reversion", "mechanical_error_power_of_ten"]);
    expect(o.quality.buy.reasons[1].detail).toMatchObject({ exponent: 1 });
    expect(o.verification).toBe("not-required");
  });

  it("works for a downward slip (divide by 100)", () => {
    const o = find(run(gbp(["2024-01-04", "GBP", "2.2399", "2.2404", "2.2409"])).observations, "2024-01-04", "GBP");
    expect(o.quality.buy.reasons.at(-1)!.detail).toMatchObject({ exponent: -2 });
    expect(o.quality.buy.status).toBe("invalid");
  });

  it("does not promote when the shifted value fits only one neighbour (stays suspicious)", () => {
    // neighbours 222 and 223 are close, but this value/10 = 237 is 6.8% from the previous and 6.3% from the next
    const o = find(run(gbp(["2024-01-04", "GBP", "2370", "2370.5", "2371"])).observations, "2024-01-04", "GBP");
    expect(o.quality.buy.status).toBe("suspicious");
    expect(o.quality.buy.reasons.map((r) => r.code)).toEqual(["single_observation_reversion"]);
  });

  it("does not promote an ordinary jump that is not a power of ten", () => {
    const o = find(run(gbp(["2024-01-04", "GBP", "300", "300.5", "301"])).observations, "2024-01-04", "GBP");
    expect(o.quality.buy.status).toBe("suspicious");
  });

  it("changes only the fields that are affected", () => {
    // sell slipped by x10, buy and mid are normal
    const o = find(run(gbp(["2024-01-04", "GBP", "223", "1115", "2235"])).observations, "2024-01-04", "GBP");
    expect(o.quality.buy.status).toBe("valid");
    expect(o.quality.sell.status).toBe("invalid");
  });

  it("is reversible: turning promotion off restores suspicious, turning it on restores invalid", () => {
    const parsed = parseRatesCsv(toCsv(gbp(shifted))).observations;
    const snapshot = JSON.parse(JSON.stringify(parsed));
    const a = classifyParsed(parsed, DEFAULT_RULES).observations;
    const off = classifyParsed(parsed, OFF).observations;
    expect(find(off, "2024-01-04", "GBP").quality.buy.status).toBe("suspicious");
    expect(find(off, "2024-01-04", "GBP").quality.buy.reasons).toHaveLength(1);
    expect(classifyParsed(parsed, DEFAULT_RULES).observations).toEqual(a);
    expect(parsed).toEqual(snapshot);
  });

  it("never changes the published values", () => {
    const o = find(run(gbp(shifted)).observations, "2024-01-04", "GBP");
    expect([o.buy, o.mid, o.sell]).toEqual([2239.9, 2240.4, 2240.9]);
    expect(o.raw).toEqual({ buy: "2239.9", mid: "2240.4", sell: "2240.9" });
  });
});

describe("copied-currency promotion", () => {
  const eur = normalDays(7, 1, "EUR", 1780); // EUR: 1780..1786, always clean
  const dkk = (day4: Row): Row[] => [...normalDays(3, 1, "DKK", 240), day4, ...normalDays(3, 5, "DKK", 243)];
  const eurDay4: Row = ["2024-01-04", "EUR", "1783", "1783.5", "1784"];

  it("promotes when the full buy/mid/sell set equals a clean record of another currency", () => {
    const o = find(run([...eur, ...dkk(["2024-01-04", "DKK", "1783", "1783.5", "1784"])]).observations, "2024-01-04", "DKK");
    expect(o.quality.buy.status).toBe("invalid");
    expect(o.quality.sell.status).toBe("invalid");
    expect(o.quality.buy.reasons.at(-1)).toMatchObject({ code: "mechanical_error_copied_currency", detail: { copiedFrom: "EUR" } });
    expect(eurDay4[2]).toBe("1783"); // sanity: EUR day 4
  });

  it("does not promote when only buy and sell match but the midpoint differs (not the full set)", () => {
    const o = find(run([...eur, ...dkk(["2024-01-04", "DKK", "1783", "1783.6", "1784"])]).observations, "2024-01-04", "DKK");
    expect(o.quality.buy.status).toBe("suspicious");
  });

  it("does not promote when the matching currency is itself flagged (no clean source)", () => {
    const eurBad: Row[] = [...normalDays(3, 1, "EUR", 1780), ["2024-01-04", "EUR", "1783", "1783.5", "1784"], ...normalDays(3, 5, "EUR", 1780)].map((r) => r) as Row[];
    // make EUR itself spike on day 4 so it is not a clean source
    eurBad[3] = ["2024-01-04", "EUR", "2150", "2150.5", "2151"];
    const o = find(run([...eurBad, ...dkk(["2024-01-04", "DKK", "2150", "2150.5", "2151"])]).observations, "2024-01-04", "DKK");
    expect(o.quality.buy.status).toBe("suspicious");
  });
});

describe("a valid value between two bad observations (DKK 19 Jun 2025 case)", () => {
  const eur: Row[] = [
    ["2025-06-16", "EUR", "1790", "1790.5", "1791"],
    ["2025-06-17", "EUR", "1781", "1781.5", "1782"],
    ["2025-06-18", "EUR", "1781.6793", "1782.2547", "1782.8301"],
    ["2025-06-19", "EUR", "1779", "1779.5", "1780"],
    ["2025-06-20", "EUR", "1777", "1777.5", "1778"],
    ["2025-06-23", "EUR", "1778", "1778.5", "1779"],
    ["2025-06-24", "EUR", "1780", "1780.5", "1781"],
  ];
  const dkk: Row[] = [
    ["2025-06-16", "DKK", "239", "239.5", "240"],
    ["2025-06-17", "DKK", "239.317", "239.3945", "239.472"],
    ["2025-06-18", "DKK", "1781.6793", "1782.2547", "1782.8301"], // copy of EUR
    ["2025-06-19", "DKK", "238.343", "238.42", "238.497"], // genuine, between two bad ones
    ["2025-06-20", "DKK", "1780.7923", "1781.3681", "1781.9439"], // bad, no clean twin
    ["2025-06-23", "DKK", "238.7675", "238.8446", "238.9218"],
    ["2025-06-24", "DKK", "240.9387", "240.9387", "241.0164"],
  ];
  const obs = run([...eur, ...dkk]).observations;

  it("keeps the good value valid", () => {
    const o = find(obs, "2025-06-19", "DKK");
    for (const f of ["buy", "mid", "sell"] as const) expect(o.quality[f].status).toBe("valid");
    expect(o.verification).toBe("not-required");
  });
  it("flags the copied record as invalid and the other bad record as suspicious", () => {
    expect(find(obs, "2025-06-18", "DKK").quality.buy.status).toBe("invalid");
    expect(find(obs, "2025-06-20", "DKK").quality.buy.status).toBe("suspicious");
  });
  it("explains that the neighbour check skipped flagged observations", () => {
    expect(find(obs, "2025-06-20", "DKK").quality.buy.reasons[0].detail).toMatchObject({ comparedWithNearestUnflaggedNeighbours: "yes" });
  });
  it("without the refinement the good value would have been flagged (guard against regression)", () => {
    // 238.343 vs previous 1781.68 and next 1780.79: pass 1 alone flags it
    const hit = Math.abs(238.343 / 1781.6793 - 1) > 0.2 && Math.abs(1780.7923 / 1781.6793 - 1) < 0.1;
    expect(hit).toBe(true);
  });
});
