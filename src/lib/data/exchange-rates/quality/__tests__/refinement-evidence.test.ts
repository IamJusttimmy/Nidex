import { describe, expect, it } from "vitest";
import { explainFlagged } from "../evidence";
import { findReversions } from "../classify";
import { DEFAULT_RULES } from "../config";
import { find, normalDays, run, type Row } from "./helpers";

describe("neighbour refinement (a good value between two corrupted ones)", () => {
  const v = [239, 239.3, 1781, 238.3, 1780, 238.8, 239];
  it("pass 1 alone would flag the good middle value; the refinement clears it", () => {
    const hits = findReversions(v, DEFAULT_RULES);
    expect(hits[2]).not.toBeNull(); // 1781 stays flagged
    expect(hits[4]).not.toBeNull(); // 1780 stays flagged
    expect(hits[3]).toBeNull(); // 238.3 is not a spike
    expect(hits[2]!.refined).toBe(true);
  });
  it("leaves ordinary spikes untouched and marks them as not refined", () => {
    const hits = findReversions([239, 239.3, 1781, 239.1, 239], DEFAULT_RULES);
    expect(hits[2]!.refined).toBe(false);
  });
  it("works end to end and the reason shows what was compared", () => {
    const rows: Row[] = [
      ["2025-06-16", "DKK", "239", "239.5", "240"],
      ["2025-06-17", "DKK", "239.3", "239.8", "240.3"],
      ["2025-06-18", "DKK", "1781", "1781.5", "1782"],
      ["2025-06-19", "DKK", "238.3", "238.8", "239.3"],
      ["2025-06-20", "DKK", "1780", "1780.5", "1781"],
      ["2025-06-23", "DKK", "238.8", "239.3", "239.8"],
      ["2025-06-24", "DKK", "239", "239.5", "240"],
    ];
    const obs = run(rows).observations;
    expect(find(obs, "2025-06-19", "DKK").quality.buy.status).toBe("valid");
    expect(find(obs, "2025-06-18", "DKK").quality.buy.status).toBe("suspicious");
    expect(find(obs, "2025-06-18", "DKK").quality.buy.reasons[0].detail).toMatchObject({ next: 238.8 });
  });
});

describe("evidence (never changes a status)", () => {
  const noPromotion = { ...DEFAULT_RULES, promoteMechanicalErrors: false };

  it("describes a power-of-ten shift without promoting it when promotion is off", () => {
    const rows: Row[] = [...normalDays(3, 1, "GBP", 220), ["2024-01-04", "GBP", "2239.9", "2240.4", "2240.9"], ...normalDays(3, 5, "GBP", 223)];
    const rep = run(rows, noPromotion);
    const o = find(rep.observations, "2024-01-04", "GBP");
    expect(explainFlagged(o, rep.observations).kind).toBe("power_of_ten_shift");
    expect(o.quality.buy.status).toBe("suspicious");
  });
  it("describes a table-wide event, and says none when nothing explains it", () => {
    const codes = ["USD", "EUR", "GBP", "CHF", "JPY"];
    const rows: Row[] = codes.flatMap((c, k) => [
      ...normalDays(3, 1, c, 500 + k * 37),
      ["2024-01-04", c, String(1000 + k * 77), String(1000.5 + k * 77), String(1001 + k * 77)] as Row,
      ...normalDays(3, 5, c, 503 + k * 37),
    ]);
    const rep = run(rows);
    expect(explainFlagged(find(rep.observations, "2024-01-04", "USD"), rep.observations).kind).toBe("table_wide_event");
    const lone = run([...normalDays(3), ["2024-01-04", "USD", "1500", "1500.5", "1501"], ...normalDays(3, 5, "USD", 1004)]);
    expect(explainFlagged(find(lone.observations, "2024-01-04"), lone.observations).kind).toBe("none");
  });
});
