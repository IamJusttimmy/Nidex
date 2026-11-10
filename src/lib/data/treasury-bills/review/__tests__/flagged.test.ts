import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isRateSeriesEligible, NTB_FIELDS, RAW_KEY_OF_FIELD, type NtbObservation, type NtbSummary } from "../../quality";
import { classify } from "../../quality/__tests__/helpers";
import { filterRows, flaggedRows, reviewCounts, ruleRows } from "../index";

describe("flaggedRows: who is listed", () => {
  it("does not list a valid auction whose rate is on the chart", () => {
    expect(flaggedRows([classify({ id: 1 })])).toEqual([]);
  });

  it("does not list an auction only because its true yield was published as 0.0000", () => {
    expect(flaggedRows([classify({ id: 1, trueYield: "0.0000" })])).toEqual([]);
  });

  it("lists a suspicious rate: original text, reasons, and 'only with suspicious rates shown'", () => {
    const [row] = flaggedRows([classify({ id: 4, rate: "20.0000" })]);
    expect(row).toMatchObject({ id: 4, worst: "suspicious", chart: "only-with-suspicious", rawLabel: "Issue" });
    const rate = row!.fields.find((f) => f.field === "rate")!;
    expect(rate).toMatchObject({ label: "Rate", level: "suspicious", rawText: "20.0000", isAmount: false });
    expect(rate.reasons[0]).toMatchObject({ code: "rate_outside_bid_range", title: "Rate outside the published range of bids" });
    expect(rate.reasons[0]!.message).toContain("20");
    // the true yield no longer fits a 20% rate, so it is flagged on its own as well
    expect(row!.fields.map((f) => f.field)).toEqual(["rate", "trueYield"]);
  });

  it("lists an invalid rate as off the chart", () => {
    const [row] = flaggedRows([classify({ id: 3, rate: "196300.0000" })]);
    expect(row).toMatchObject({ worst: "invalid", chart: "off-chart" });
    expect(row!.fields.map((f) => [f.field, f.level, f.rawText])).toContainEqual(["rate", "invalid", "196300.0000"]);
  });

  it("lists an auction with no published rate as 'not published' and off the chart, with CBN's text", () => {
    const [row] = flaggedRows([classify({ id: 2, rate: "0.0000" })]);
    expect(row).toMatchObject({ worst: "not-published", chart: "off-chart" });
    expect(row!.fields[0]).toMatchObject({ field: "rate", level: "not-published", rawText: "0.0000" });
  });

  it("lists a flagged maturity date but shows the rate is still on the chart (the ruling made visible)", () => {
    const [row] = flaggedRows([classify({ id: 1, maturityDate: "September-02-2026" })]);
    expect(row!.fields.map((f) => f.field)).toEqual(["maturityDate"]);
    expect(row!.chart).toBe("on-chart");
  });

  it("lists a non-standard tenor as off the chart", () => {
    const [row] = flaggedRows([classify({ id: 5, tenor: "3" })]);
    expect(row!.chart).toBe("off-chart");
    expect(row!.fields.map((f) => f.field)).toContain("tenor");
    expect(row!.rawTenor).toBe("3");
  });

  it("lists an unreadable auction date, keeping CBN's text", () => {
    const [row] = flaggedRows([classify({ id: 6, auctionDate: "not a date" })]);
    expect(row).toMatchObject({ date: null, rawDate: "not a date", chart: "off-chart" });
    expect(row!.fields.map((f) => f.field)).toContain("auctionDate");
  });

  it("marks amount fields so the page can label them 'unit unconfirmed'", () => {
    const [row] = flaggedRows([classify({ id: 7, amtOffered: "100.0000", totalSubscription: "162210976.0000", totalSuccessful: "148565439.0000" })]);
    const amounts = row!.fields.filter((f) => f.isAmount);
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((f) => f.rawText.length > 0)).toBe(true);
    expect(row!.chart).toBe("on-chart");
  });

  it("calls the worst level the most serious one", () => {
    const [row] = flaggedRows([classify({ id: 1, rate: "196300.0000", maturityDate: "September-02-2026" })]);
    expect(row!.worst).toBe("invalid");
  });

  it("lists fields in a fixed order", () => {
    const [row] = flaggedRows([classify({ id: 1, rate: "20.0000", maturityDate: "September-02-2026" })]);
    const order = row!.fields.map((f) => NTB_FIELDS.indexOf(f.field));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("flaggedRows: order and safety", () => {
  it("sorts newest first, unreadable dates last, ties by id (newest id first)", () => {
    const rows = flaggedRows([
      classify({ id: 1, auctionDate: "March-04-2026", rate: "20.0000" }),
      classify({ id: 2, auctionDate: "March-11-2026", maturityDate: "June-10-2026", rate: "20.0000" }),
      classify({ id: 3, auctionDate: "not a date" }),
      classify({ id: 4, auctionDate: "March-11-2026", maturityDate: "June-10-2026", rate: "20.0000" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([4, 2, 1, 3]);
  });

  it("does not modify the observations it is given", () => {
    const records = [classify({ id: 1, rate: "20.0000" }), classify({ id: 2, rate: "0.0000" })];
    const before = JSON.stringify(records);
    const rows = flaggedRows(records);
    rows[0]!.fields[0]!.reasons.push({ code: "unparseable", title: "x", message: "tampered" });
    expect(JSON.stringify(records)).toBe(before);
  });
});

describe("filterRows and reviewCounts", () => {
  const rows = flaggedRows([
    classify({ id: 1, rate: "20.0000" }),
    classify({ id: 2, rate: "196300.0000" }),
    classify({ id: 3, rate: "0.0000" }),
    classify({ id: 4, maturityDate: "September-02-2026" }),
  ]);

  it("shows everything for all/all", () => {
    expect(filterRows(rows, { level: "all", field: "all" })).toHaveLength(rows.length);
  });

  it("filters by level and by field, and by both together", () => {
    expect(filterRows(rows, { level: "invalid", field: "all" }).map((r) => r.id)).toEqual([2]);
    expect(filterRows(rows, { level: "all", field: "maturityDate" }).map((r) => r.id)).toEqual([4]);
    expect(filterRows(rows, { level: "suspicious", field: "rate" }).map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, { level: "not-published", field: "maturityDate" })).toEqual([]);
  });

  it("keeps all of a kept row's flagged fields visible", () => {
    const both = flaggedRows([classify({ id: 1, rate: "20.0000", maturityDate: "September-02-2026" })]);
    const [kept] = filterRows(both, { level: "all", field: "rate" });
    expect(kept!.fields.map((f) => f.field)).toEqual(["maturityDate", "rate", "trueYield"]);
  });

  it("counts rows by level, by field and off the chart", () => {
    const c = reviewCounts(rows);
    expect(c.total).toBe(rows.length);
    expect(c.byLevel["not-published"]).toBe(1);
    expect(c.byField.rate).toBe(3);
    expect(c.byField.maturityDate).toBe(1);
    expect(c.offChart).toBe(rows.filter((r) => r.chart !== "on-chart").length);
  });
});

describe("ruleRows", () => {
  const reasons: NtbSummary["reasons"] = [
    { field: "rateLabel", code: "rate_label_standardised", status: "valid", records: 150, firstDate: "2002-05-16", lastDate: "2023-12-13", sampleIds: [1] },
    { field: "rate", code: "rate_outside_bid_range", status: "suspicious", records: 5, firstDate: "2005-01-05", lastDate: "2020-12-02", sampleIds: [2] },
    { field: "maturityDate", code: "maturity_inconsistent_with_tenor", status: "suspicious", records: 109, firstDate: "2002-01-03", lastDate: "2026-09-02", sampleIds: [3] },
    { field: "rate", code: "rate_implausible", status: "invalid", records: 1, firstDate: "2010-01-01", lastDate: "2010-01-01", sampleIds: [4] },
  ];

  it("orders invalid, then suspicious, then notes; larger counts first within each", () => {
    expect(ruleRows(reasons).map((r) => [r.result, r.records])).toEqual([
      ["invalid", 1],
      ["suspicious", 109],
      ["suspicious", 5],
      ["note", 150],
    ]);
  });

  it("gives every row a field name and rule title, and calls a valid-status rule a 'note'", () => {
    const rows = ruleRows(reasons);
    expect(rows.every((r) => r.fieldLabel && r.title)).toBe(true);
    expect(rows.find((r) => r.code === "rate_label_standardised")).toMatchObject({ result: "note", fieldLabel: "Rate label", title: "Label spelling standardised" });
  });

  it("does not modify its input", () => {
    const copy = JSON.stringify(reasons);
    ruleRows(reasons);
    expect(JSON.stringify(reasons)).toBe(copy);
  });
});

describe("review of the published file", () => {
  const root = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
  const doc = JSON.parse(readFileSync(path.join(root, "public", "data", "treasury-bills", "latest.json"), "utf8")) as {
    observations: NtbObservation[];
    summary: NtbSummary;
  };
  const rows = flaggedRows(doc.observations);
  const byId = new Map(doc.observations.map((o) => [o.id, o]));

  it("lists every auction that is off the rate chart, each with at least one flagged field to explain it", () => {
    const listed = new Set(rows.map((r) => r.id));
    for (const o of doc.observations) {
      if (!isRateSeriesEligible(o)) {
        expect(listed.has(o.id)).toBe(true);
        expect(rows.find((r) => r.id === o.id)!.fields.length).toBeGreaterThan(0);
      }
    }
  });

  it("lists every auction with a suspicious or invalid field, and matches the published summary", () => {
    const withVerdict = rows.filter((r) => r.fields.some((f) => f.level === "invalid" || f.level === "suspicious"));
    const s = doc.summary.recordsByWorstStatus;
    expect(withVerdict).toHaveLength(s.suspicious + s.invalid);
    expect(withVerdict.filter((r) => r.worst === "invalid")).toHaveLength(s.invalid);
  });

  it("shows each flagged field's value exactly as CBN published it, and each row's chart status matches the chart's rule", () => {
    for (const r of rows) {
      const o = byId.get(r.id)!;
      for (const f of r.fields) expect(f.rawText).toBe(String(o.raw[RAW_KEY_OF_FIELD[f.field]]));
      expect(r.chart === "on-chart").toBe(isRateSeriesEligible(o));
      expect(r.rawLabel).toBe(o.raw.rateDescription);
    }
  });

  it("gives every rule that fired in the file a readable title and field name", () => {
    const rules = ruleRows(doc.summary.reasons);
    expect(rules).toHaveLength(doc.summary.reasons.length);
    for (const r of rules) {
      expect(r.title).toBeTruthy();
      expect(r.fieldLabel).toBeTruthy();
      expect(r.records).toBeGreaterThan(0);
    }
  });
});
