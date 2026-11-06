import { describe, expect, it } from "vitest";
import { buildChartSeries } from "../chart-series";
import { DEFAULT_RULES } from "../config";
import { find, run, type Row } from "./helpers";

/** USD centre 1000+i; the other currency's centre = USD centre x factor, optionally overridden on one day. */
function pair(n: number, factor: number, other: string, overrideDay?: { i: number; factorX: number }): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const d = `2024-01-${String(i + 1).padStart(2, "0")}`;
    const u = 1000 + i;
    rows.push([d, "USD", String(u - 0.5), String(u), String(u + 0.5)]);
    const f = overrideDay && overrideDay.i === i ? overrideDay.factorX : factor;
    const c = u * f;
    rows.push([d, other, c.toFixed(4), (c + 0.5).toFixed(4), (c + 1).toFixed(4)]);
  }
  return rows;
}

describe("cross-rate warnings (evidence only)", () => {
  it("gives no warning when the implied cross rate is stable", () => {
    const obs = run(pair(9, 0.001, "CNY")).observations;
    expect(obs.every((o) => o.warnings.length === 0)).toBe(true);
  });

  it("warns when a currency implies a different US dollar rate, without touching status or values", () => {
    const before = run(pair(9, 0.001, "CNY"));
    const rep = run(pair(9, 0.001, "CNY", { i: 4, factorX: 0.0012 })); // CNY +20% on one day, USD unchanged
    const o = find(rep.observations, "2024-01-05", "CNY");
    expect(o.warnings[0].code).toBe("cross_rate_break");
    expect(o.warnings[0].detail!.deviation).toBeGreaterThan(0.05);
    // the warning did not change anything else
    expect(o.quality.buy.status).not.toBe("invalid");
    expect(o.buy).toBe(Number((1004 * 0.0012).toFixed(4)));
    expect(find(before.observations, "2024-01-05", "CNY").buy).not.toBe(o.buy);
  });

  it("does not invalidate: a warning alone leaves a value valid and charted", () => {
    // +8% in one day: below the spike rule (20%) but above the 5% cross threshold, and it persists one day only
    const rep = run(pair(9, 0.001, "CNY", { i: 4, factorX: 0.00108 }));
    const o = find(rep.observations, "2024-01-05", "CNY");
    expect(o.warnings).toHaveLength(1);
    expect(o.quality.buy.status).toBe("valid");
    const pts = buildChartSeries(rep.observations.filter((x) => x.code === "CNY"), "buy");
    const p = pts.find((x) => x.date === "2024-01-05")!;
    expect(p).toBeDefined();
    expect(p.warnings).toHaveLength(1);
  });

  it("produces no warning for a move shared by the whole table, including USD", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 9; i++) {
      const d = `2024-01-${String(i + 1).padStart(2, "0")}`;
      const u = i === 4 ? 1250 : 1000 + i;
      rows.push([d, "USD", String(u - 0.5), String(u), String(u + 0.5)]);
      rows.push([d, "CNY", (u * 0.001).toFixed(4), (u * 0.001 + 0.0005).toFixed(4), (u * 0.001 + 0.001).toFixed(4)]);
    }
    const obs = run(rows).observations;
    expect(obs.every((o) => o.warnings.length === 0)).toBe(true);
  });

  it("is not evaluated when USD is unusable that day", () => {
    const rows = pair(9, 0.001, "CNY", { i: 4, factorX: 0.0012 }).map((r) => (r[0] === "2024-01-05" && r[1] === "USD" ? (["2024-01-05", "USD", "1010", "1009.5", "1009"] as Row) : r));
    expect(find(run(rows).observations, "2024-01-05", "CNY").warnings).toHaveLength(0);
  });

  it("needs at least two clean reference observations", () => {
    const rows = pair(2, 0.001, "CNY", { i: 1, factorX: 0.002 });
    expect(run(rows).observations.every((o) => o.warnings.length === 0)).toBe(true);
  });

  it("can be reasoned about with the threshold in the rules", () => {
    const rep = run(pair(9, 0.001, "CNY", { i: 4, factorX: 0.00108 }), { ...DEFAULT_RULES, crossRateThreshold: 0.5 });
    expect(rep.observations.every((o) => o.warnings.length === 0)).toBe(true);
  });

  it("leaves out the currencies listed in crossRateExcludedCodes", () => {
    const rows = pair(9, 0.001, "XOF", { i: 4, factorX: 0.0012 });
    expect(run(rows).observations.every((o) => o.warnings.length === 0)).toBe(true);
    const on = run(rows, { ...DEFAULT_RULES, crossRateExcludedCodes: [] });
    expect(find(on.observations, "2024-01-05", "XOF").warnings).toHaveLength(1);
  });
});
