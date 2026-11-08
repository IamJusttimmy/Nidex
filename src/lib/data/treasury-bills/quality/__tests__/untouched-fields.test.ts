import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, classifyRecord } from "../index";
import { rec } from "./helpers";

const FOUR = ["week", "netType", "netValue", "totalAmtRepaid"] as const;

describe("week, netType, netValue and totalAmtRepaid are preserved and never assessed", () => {
  const strange = { week: "99th Week", netType: "???", netValue: "not a number", totalAmtRepaid: "-5.0000" };

  it("keeps their text exactly as published", () => {
    const o = classifyRecord(rec(strange));
    for (const f of FOUR) expect(o.raw[f]).toBe(strange[f]);
  });

  it("changes nothing else about the observation, whatever they contain", () => {
    const normal = classifyRecord(rec());
    const odd = classifyRecord(rec(strange));
    const withoutRaw = (o: typeof normal) => {
      const copy: Record<string, unknown> = { ...o };
      delete copy.raw;
      return copy;
    };
    expect(withoutRaw(odd)).toEqual(withoutRaw(normal));
  });

  it("has no quality field for any of the four", () => {
    const o = classifyRecord(rec(strange));
    for (const f of FOUR) expect(Object.keys(o.quality)).not.toContain(f);
  });

  it("does not reject a record for their content, and empty values pass through too", () => {
    const { observations, rejected } = buildNtbQualityReport([rec({ id: 1, ...strange }), rec({ id: 2, week: "", netType: "", netValue: "", totalAmtRepaid: "" })]);
    expect(rejected).toEqual([]);
    expect(observations).toHaveLength(2);
    expect(observations[1]!.raw.week).toBe("");
  });
});