import { describe, expect, it } from "vitest";
import { buildChartSeries, flaggedObservations } from "../chart-series";
import { DEFAULT_RULES } from "../config";
import { classifyParsed } from "../pipeline";
import { CsvHeaderError, parseRatesCsv, parseRateNumber } from "../parse";
import { find, normalDays, run, toCsv, type Row } from "./helpers";

describe("parsing and structural validation", () => {
  it("rejects a file with a missing required column", () => {
    expect(() => parseRatesCsv("date,code,buy\n2024-01-01,USD,1")).toThrow(CsvHeaderError);
  });
  it("keeps unreadable rows in `rejected` with the reason, never silently", () => {
    const csv = "date,code,buy,mid,sell\n2024-02-30,USD,1,1,1\n2024-01-01,usd,1,1,1\n2024-01-01,USD,abc,1,1\n2024-01-01,USD,-5,1,1\n2024-01-01,USD,1,1\n2024-01-02,USD,1000,1000.5,1001\n";
    const r = parseRatesCsv(csv);
    expect(r.observations).toHaveLength(1);
    expect(r.rejected.map((x) => x.kind)).toEqual(["invalid_date", "invalid_code", "invalid_number", "invalid_number", "wrong_column_count"]);
    expect(r.sourceRowCount).toBe(6);
  });
  it("treats an empty value and zero as not published, never as a real zero", () => {
    expect(parseRateNumber("")).toEqual({ kind: "missing" });
    expect(parseRateNumber("0.0000")).toEqual({ kind: "missing" });
    const obs = run([...normalDays(2), ["2024-01-03", "USD", "", "0.0000", "1005"], ...normalDays(2, 4, "USD", 1003)]).observations;
    const o = find(obs, "2024-01-03");
    expect([o.buy, o.mid, o.sell]).toEqual([null, null, 1005]);
    expect(o.quality.buy.reasons[0].code).toBe("not_published");
    expect(o.raw.mid).toBe("0.0000"); // original text still there
  });
  it("keeps the first of a duplicate key and reports the later one as rejected", () => {
    const r = parseRatesCsv(toCsv([["2024-01-01", "USD", "1000", "1000.5", "1001"], ["2024-01-01", "USD", "2000", "2000.5", "2001"]]));
    expect(r.observations).toHaveLength(1);
    expect(r.observations[0].buy).toBe(1000);
    expect(r.rejected[0]).toMatchObject({ kind: "duplicate_key", sourceRow: 2 });
    expect(r.rejected[0].message).toContain("conflicting");
  });
  it("set aside base-currency rows are counted, not hidden", () => {
    const rep = run([...normalDays(3), ["2024-01-01", "NGN", "1", "1", "1"]]);
    expect(rep.excluded).toEqual([{ code: "NGN", rows: 1 }]);
    expect(rep.observations.every((o) => o.code !== "NGN")).toBe(true);
  });
});

describe("preservation of source values", () => {
  const rows: Row[] = [...normalDays(3), ["2024-01-04", "USD", "1500.12340", "1500.5", "1501"], ["2024-01-05", "USD", "1004", "1004.5", "1005"], ...normalDays(2, 6, "USD", 1005)];
  it("keeps raw text exactly, including trailing zeros, and never changes numbers", () => {
    const csv = toCsv(rows);
    const rep = run(rows);
    const o = find(rep.observations, "2024-01-04");
    expect(o.raw.buy).toBe("1500.12340");
    expect(o.buy).toBe(1500.1234);
    expect(rep.observations).toHaveLength(rows.length); // nothing dropped, even flagged ones
    expect(csv).toBe(toCsv(rows)); // input text is untouched
  });
  it("every source row ends up in observations or rejected", () => {
    const csv = toCsv(rows) + "2024-02-30,USD,1,1,1\n";
    const parsed = parseRatesCsv(csv);
    expect(parsed.observations.length + parsed.rejected.length).toBe(parsed.sourceRowCount);
  });
});

describe("reversibility", () => {
  const rows: Row[] = [...normalDays(3, 1, "USD", 840), ["2024-01-04", "USD", "1038.63", "1039.13", "1039.63"], ["2024-01-05", "USD", "843", "843.5", "844"], ...normalDays(2, 6, "USD", 844)];
  it("a rule change reclassifies the same rows and leaves values untouched", () => {
    const parsed = parseRatesCsv(toCsv(rows)).observations;
    const snapshot = JSON.parse(JSON.stringify(parsed));

    const strict = classifyParsed(parsed, DEFAULT_RULES).observations;
    const lenient = classifyParsed(parsed, { ...DEFAULT_RULES, spikeJump: 0.5 }).observations;
    expect(find(strict, "2024-01-04").quality.buy.status).toBe("suspicious");
    expect(find(lenient, "2024-01-04").quality.buy.status).toBe("valid");

    // going back to the original rules gives the original answer
    const again = classifyParsed(parsed, DEFAULT_RULES).observations;
    expect(again).toEqual(strict);
    // and the parsed source rows were never mutated
    expect(parsed).toEqual(snapshot);
  });
});

describe("verification state", () => {
  const rows: Row[] = [...normalDays(3, 1, "USD", 840), ["2024-01-04", "USD", "1038.63", "1039.13", "1039.63"], ["2024-01-05", "USD", "843", "843.5", "844"], ...normalDays(2, 6, "USD", 844)];
  it("suspicious defaults to pending; valid is not-required", () => {
    const obs = run(rows).observations;
    expect(find(obs, "2024-01-04").verification).toBe("pending");
    expect(find(obs, "2024-01-01").verification).toBe("not-required");
  });
  it("an override sets unresolved without changing the quality status", () => {
    const obs = run(rows, DEFAULT_RULES, [{ date: "2024-01-04", code: "*", status: "unresolved", note: "checked, not settled" }]).observations;
    const o = find(obs, "2024-01-04");
    expect(o.verification).toBe("unresolved");
    expect(o.verificationNote).toBe("checked, not settled");
    expect(o.quality.buy.status).toBe("suspicious");
  });
  it("invalid-only observations need no verification", () => {
    const obs = run([...normalDays(3), ["2024-01-04", "USD", "1010", "1009.5", "1009"], ...normalDays(3, 5, "USD", 1004)]).observations;
    expect(find(obs, "2024-01-04").verification).toBe("not-required");
  });
});

describe("chart-ready series", () => {
  const rows: Row[] = [
    ...normalDays(3, 1), // 1..3 valid
    ["2024-01-04", "USD", "1500", "1500.5", "1501"], // 4: coherent spike -> suspicious
    ["2024-01-05", "USD", "1004", "1004.5", "1005"], // 5: valid
    ["2024-01-06", "USD", "1010", "1009.5", "1009"], // 6: buy>sell -> pair invalid
    ["2024-01-07", "USD", "1006", "10060", "1007"], // 7: mid invalid only
    ...normalDays(2, 8, "USD", 1007),
  ];
  const obs = run(rows).observations;
  const dates = (s: { date: string }[]) => s.map((p) => p.date.slice(8));

  it("default series contain only valid points", () => {
    expect(dates(buildChartSeries(obs, "buy"))).toEqual(["01", "02", "03", "05", "07", "08", "09"]);
  });
  it("an invalid midpoint does not remove the buy or sell point, and does not appear in the mid series", () => {
    expect(dates(buildChartSeries(obs, "sell"))).toContain("07");
    expect(dates(buildChartSeries(obs, "mid"))).not.toContain("07");
  });
  it("an invalid quote pair removes that day's buy and sell, but not its mid", () => {
    expect(dates(buildChartSeries(obs, "buy"))).not.toContain("06");
    expect(dates(buildChartSeries(obs, "sell"))).not.toContain("06");
    expect(dates(buildChartSeries(obs, "mid"))).toContain("06");
  });
  it("showFlagged adds suspicious points with their reasons, as flagged markers", () => {
    const s = buildChartSeries(obs, "buy", { showFlagged: true });
    const p = s.find((x) => x.date === "2024-01-04")!;
    expect(p.status).toBe("suspicious");
    expect(p.reasons[0].code).toBe("single_observation_reversion");
    expect(dates(s)).not.toContain("06"); // invalid still hidden
  });
  it("showInvalid gives raw-value inspection", () => {
    expect(dates(buildChartSeries(obs, "buy", { showFlagged: true, showInvalid: true }))).toContain("06");
  });
  it("flagged-records view lists every flagged row", () => {
    expect(flaggedObservations(obs).map((o) => o.date.slice(8))).toEqual(["04", "06", "07"]);
  });
});
