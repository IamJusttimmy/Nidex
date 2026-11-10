import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NTB_FIELDS } from "../../treasury-bills/quality";
import { filterRows, flaggedRows, reviewCounts, ruleRows } from "../../treasury-bills/review";
import { buildRateSeries, latestAuctionRows } from "../../treasury-bills/series";
import { treasuryBillsSchema } from "../schema";

const root = path.resolve(__dirname, "..", "..", "..", "..", ".."); // __tests__ is five folders below the project root
const text = readFileSync(path.join(root, "public", "data", "treasury-bills", "latest.json"), "utf8");
const real = () => JSON.parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("treasuryBillsSchema on the published file", () => {
  const parsed = treasuryBillsSchema.safeParse(real());

  it("accepts the real file", () => {
    expect(parsed.success).toBe(true);
  });

  it("gives every observation an assessment for every judged field", () => {
    if (!parsed.success) throw new Error("file rejected");
    for (const o of parsed.data.observations) for (const f of NTB_FIELDS) expect(o.quality[f]).toBeDefined();
  });

  it("returns data the series, latest-auction and review code all accept", () => {
    if (!parsed.success) throw new Error("file rejected");
    const { observations, summary } = parsed.data;
    const series = buildRateSeries(observations);
    expect(series.considered).toBe(observations.length);
    expect(latestAuctionRows(series.labels[0], undefined, new Map(observations.map((o) => [o.id, o]))).length).toBeGreaterThan(0);
    const rows = flaggedRows(observations);
    expect(reviewCounts(rows).total).toBe(rows.length);
    expect(filterRows(rows, { level: "all", field: "all" })).toHaveLength(rows.length);
    expect(ruleRows(summary.reasons)).toHaveLength(summary.reasons.length);
  });

  it("keeps the published counts and the rejected records", () => {
    if (!parsed.success) throw new Error("file rejected");
    expect(parsed.data.summary.observations).toBe(parsed.data.observations.length);
    expect(parsed.data.summary.rejected).toBe(parsed.data.rejected.length);
  });
});

describe("treasuryBillsSchema refuses a damaged file", () => {
  const cases: Record<string, (d: Record<string, any>) => void> = { // eslint-disable-line @typescript-eslint/no-explicit-any
    "an observation missing one field's assessment": (d) => delete d.observations[0].quality.maturityDate,
    "an observation missing a judged field's original text": (d) => delete d.observations[0].raw.rangeBid,
    "an original text that is a number": (d) => (d.observations[0].raw.rate = 15.4),
    "no summary": (d) => delete d.summary,
    "a summary rule with an unknown code": (d) => d.summary.reasons.push({ ...d.summary.reasons[0], code: "made_up_rule" }),
    "a summary rule with an unknown field": (d) => d.summary.reasons.push({ ...d.summary.reasons[0], field: "madeUpField" }),
    "a negative count in the summary": (d) => (d.summary.recordsByWorstStatus.invalid = -1),
    "no rejected list": (d) => delete d.rejected,
    "a rejected record with an unknown kind": (d) => d.rejected.push({ index: 0, id: 1, kind: "made_up", message: "x", raw: {} }),
  };
  for (const [name, damage] of Object.entries(cases)) {
    it(name, () => {
      const d = real();
      damage(d);
      expect(treasuryBillsSchema.safeParse(d).success).toBe(false);
    });
  }
});
