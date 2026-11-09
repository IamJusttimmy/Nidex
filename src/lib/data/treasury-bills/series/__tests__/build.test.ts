import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, isRateSeriesEligible, type NtbObservation } from "../../quality";
import { classify } from "../../quality/__tests__/helpers";
import { buildRateSeries, defaultLabelKey, type RateLabelSeries } from "../index";

const label = (set: ReturnType<typeof buildRateSeries>, key: string): RateLabelSeries => {
  const found = set.labels.find((l) => l.key === key);
  if (!found) throw new Error(`no label ${key}`);
  return found;
};

describe("buildRateSeries: labels are kept apart and kept as published", () => {
  const issue = classify({ id: 1, rateDescription: "Issue", rate: "15.4000" });
  const marginal = classify({ id: 2, rateDescription: "Marginal", rate: "15.9000" });
  const stop = classify({ id: 3, rateDescription: "Stop", rate: "16.0000" });

  it("never merges Issue, Marginal and Stop: three labels, each with its own point", () => {
    // same auction date and tenor on purpose: nothing may blend them into one value
    const set = buildRateSeries([issue, marginal, stop]);
    expect(set.labels.map((l) => l.key)).toEqual(["Issue", "Marginal", "Stop"]);
    expect(label(set, "Issue").tenors[91].map((p) => [p.id, p.rate])).toEqual([[1, 15.4]]);
    expect(label(set, "Marginal").tenors[91].map((p) => [p.id, p.rate])).toEqual([[2, 15.9]]);
    expect(label(set, "Stop").tenors[91].map((p) => [p.id, p.rate])).toEqual([[3, 16]]);
  });

  it("offers only labels that exist in the data", () => {
    expect(buildRateSeries([issue]).labels.map((l) => l.key)).toEqual(["Issue"]);
    expect(buildRateSeries([marginal, stop]).labels.map((l) => l.key)).toEqual(["Marginal", "Stop"]);
    expect(buildRateSeries([]).labels).toEqual([]);
  });

  it("keeps CBN's own wording on every point, and lists each wording behind an option", () => {
    const typo = classify({ id: 4, rateDescription: "Maginal", rate: "16.0000" });
    const plural = classify({ id: 5, rateDescription: "Issue Rates", rate: "15.5000", auctionDate: "March-11-2026", maturityDate: "June-10-2026" });
    const set = buildRateSeries([issue, typo, plural]);
    const m = label(set, "Marginal");
    expect(m.tenors[91][0]).toMatchObject({ rawLabel: "Maginal", displayLabel: "Marginal" });
    const i = label(set, "Issue");
    expect(i.tenors[91].map((p) => p.rawLabel)).toEqual(["Issue", "Issue Rates"]);
    expect(i.rawLabels).toEqual([
      { text: "Issue", count: 1 },
      { text: "Issue Rates", count: 1 },
    ]);
  });

  it("gives a label Nidex does not recognise its own option under CBN's words", () => {
    const odd = classify({ id: 6, rateDescription: "Weighted Average", rate: "15.0000" });
    expect(odd.rateLabel.display).toBeNull();
    const set = buildRateSeries([issue, odd]);
    expect(set.labels.map((l) => [l.key, l.name, l.kind])).toEqual([
      ["Issue", "Issue", "standard"],
      ["other:weighted average", "Weighted Average", "unrecognised"],
    ]);
    expect(label(set, "other:weighted average").tenors[91][0]).toMatchObject({ rawLabel: "Weighted Average", displayLabel: null });
  });

  it("gives an empty label its own 'No label published' option instead of guessing one", () => {
    const blank = classify({ id: 7, rateDescription: "", rate: "15.0000" });
    const set = buildRateSeries([blank]);
    expect(set.labels).toHaveLength(1);
    expect(set.labels[0]).toMatchObject({ key: "unlabelled", name: "No label published", kind: "unlabelled" });
    expect(set.labels[0]!.tenors[91][0]!.rawLabel).toBe("");
  });

  it("orders the selector Issue, Marginal, Stop, then other labels, then 'no label'", () => {
    const odd = classify({ id: 8, rateDescription: "Weighted Average" });
    const blank = classify({ id: 9, rateDescription: "" });
    const set = buildRateSeries([blank, odd, stop, marginal, issue]);
    expect(set.labels.map((l) => l.key)).toEqual(["Issue", "Marginal", "Stop", "other:weighted average", "unlabelled"]);
  });
});

describe("buildRateSeries: which rates take part", () => {
  it("agrees with isRateSeriesEligible on every record, with and without suspicious rates", () => {
    const records = [
      classify({ id: 1 }),
      classify({ id: 2, rate: "0.0000" }), // not published
      classify({ id: 3, rate: "196300.0000" }), // invalid
      classify({ id: 4, rate: "20.0000" }), // suspicious: outside the bid range
      classify({ id: 5, tenor: "3" }), // not a standard tenor
      classify({ id: 6, auctionDate: "not a date" }), // unreadable date
      classify({ id: 7, rate: "abc" }), // unparseable
    ];
    for (const includeSuspicious of [false, true]) {
      const expected = records.filter((o) => isRateSeriesEligible(o, { includeSuspicious })).map((o) => o.id);
      const set = buildRateSeries(records, { includeSuspicious });
      const shown = set.labels.flatMap((l) => [91, 182, 364].flatMap((t) => l.tenors[t as 91 | 182 | 364].map((p) => p.id))).sort((a, b) => a - b);
      expect(shown).toEqual(expected);
      expect(set.included).toBe(expected.length);
      expect(set.included + set.excluded.total).toBe(set.considered);
      expect(set.considered).toBe(records.length);
    }
  });

  it("counts why each record was left out", () => {
    const records = [
      classify({ id: 1 }),
      classify({ id: 2, rate: "0.0000" }),
      classify({ id: 3, rate: "196300.0000" }),
      classify({ id: 4, rate: "20.0000" }),
      classify({ id: 5, tenor: "3" }),
      classify({ id: 6, auctionDate: "not a date" }),
      classify({ id: 7, rate: "abc" }),
    ];
    expect(buildRateSeries(records).excluded.byReason).toEqual({
      no_auction_date: 1,
      tenor_not_standard: 1,
      rate_not_published: 2, // the zero and the unreadable text: neither gave a usable rate
      rate_invalid: 1,
      rate_suspicious_hidden: 1,
    });
    expect(buildRateSeries(records, { includeSuspicious: true }).excluded.byReason.rate_suspicious_hidden).toBe(0);
  });

  it("hides a suspicious rate by default; when shown it stays marked suspicious and keeps its reasons", () => {
    const sus = classify({ id: 4, rate: "20.0000" });
    expect(sus.quality.rate.status).toBe("suspicious");
    expect(buildRateSeries([sus]).labels).toEqual([]);
    const point = buildRateSeries([sus], { includeSuspicious: true }).labels[0]!.tenors[91][0]!;
    expect(point.rate).toBe(20);
    expect(point.rateStatus).toBe("suspicious");
    expect(point.rateReasons.map((r) => r.code)).toContain("rate_outside_bid_range");
  });

  it("never shows an invalid rate, even when suspicious ones are requested", () => {
    const bad = classify({ id: 3, rate: "196300.0000" });
    expect(bad.quality.rate.status).toBe("invalid");
    expect(buildRateSeries([bad], { includeSuspicious: true }).labels).toEqual([]);
  });

  it("keeps a valid rate whose maturity date, true yield or amounts are flagged (the ruling)", () => {
    const flagged = [
      classify({ id: 1, maturityDate: "September-02-2026" }), // suspicious maturity
      classify({ id: 2, maturityDate: "March-04-2026" }), // invalid maturity
      classify({ id: 3, trueYield: "20.0000" }), // inconsistent true yield
      classify({ id: 4, amtOffered: "100.0000", totalSubscription: "162210976.0000", totalSuccessful: "148565439.0000" }), // amount scale
    ];
    const set = buildRateSeries(flagged);
    expect(set.included).toBe(4);
    expect(set.excluded.total).toBe(0);
  });

  it("drops a label's option when none of its rates can be shown", () => {
    const sus = classify({ id: 1, rateDescription: "Stop", rate: "20.0000" });
    const fine = classify({ id: 2, rateDescription: "Issue" });
    expect(buildRateSeries([sus, fine]).labels.map((l) => l.key)).toEqual(["Issue"]);
    expect(buildRateSeries([sus, fine], { includeSuspicious: true }).labels.map((l) => l.key)).toEqual(["Issue", "Stop"]);
  });
});

describe("buildRateSeries: tenors, order and values", () => {
  it("puts 90, 91, 363, 364 and 365-day labels in the right standard tenor and keeps the label text", () => {
    const set = buildRateSeries([
      classify({ id: 1, tenor: "90 DAY" }),
      classify({ id: 2, tenor: "182DAY", maturityDate: "September-02-2026" }),
      classify({ id: 3, tenor: "363 DAY", maturityDate: "March-03-2027" }),
      classify({ id: 4, tenor: "365Day", maturityDate: "March-04-2027" }),
    ]);
    const l = label(set, "Issue");
    expect(l.tenors[91].map((p) => p.rawTenor)).toEqual(["90 DAY"]);
    expect(l.tenors[182].map((p) => p.rawTenor)).toEqual(["182DAY"]);
    expect(l.tenors[364].map((p) => p.rawTenor).sort()).toEqual(["363 DAY", "365Day"]);
  });

  it("sorts each tenor oldest first, ties by id, and reports the first and last dates", () => {
    const set = buildRateSeries([
      classify({ id: 30, auctionDate: "March-18-2026", maturityDate: "June-17-2026" }),
      classify({ id: 10, auctionDate: "March-04-2026" }),
      classify({ id: 21, auctionDate: "March-11-2026", maturityDate: "June-10-2026" }),
      classify({ id: 20, auctionDate: "March-11-2026", maturityDate: "June-10-2026" }),
    ]);
    const l = label(set, "Issue");
    expect(l.tenors[91].map((p) => [p.date, p.id])).toEqual([
      ["2026-03-04", 10],
      ["2026-03-11", 20],
      ["2026-03-11", 21],
      ["2026-03-18", 30],
    ]);
    expect([l.firstDate, l.lastDate, l.pointCount]).toEqual(["2026-03-04", "2026-03-18", 4]);
  });

  it("carries the rate exactly as the checker read it, with nothing calculated or rounded", () => {
    const o = classify({ id: 1, rate: "15.4000" });
    const p = buildRateSeries([o]).labels[0]!.tenors[91][0]!;
    expect(p.rate).toBe(o.rate);
    expect(p.date).toBe(o.auctionDate);
    expect(p.rate).toBe(15.4);
  });

  it("keeps warnings on the point (a conflicting duplicate stays visible)", () => {
    const [a, b] = buildNtbQualityReport([
      { ...classify({ id: 1 }).raw },
      { ...classify({ id: 2, rate: "16.0000" }).raw },
    ]).observations;
    const set = buildRateSeries([a!, b!]);
    const points = label(set, "Issue").tenors[91];
    expect(points.flatMap((p) => p.warnings)).toContain("conflicting_duplicate_auction");
  });

  it("does not modify the observations it is given", () => {
    const records: NtbObservation[] = [classify({ id: 1 }), classify({ id: 2, rate: "20.0000" }), classify({ id: 3, rateDescription: "Maginal" })];
    const before = JSON.stringify(records);
    const set = buildRateSeries(records, { includeSuspicious: true });
    // changing what the series hands out must not reach back into the original records
    for (const l of set.labels) for (const p of l.tenors[91]) p.rateReasons.push({ code: "unparseable", message: "tampered" });
    expect(JSON.stringify(records)).toBe(before);
  });
});

describe("defaultLabelKey", () => {
  it("picks the label with the most points, ties going to the selector order", () => {
    const many = [1, 2, 3].map((n) => classify({ id: n, rateDescription: "Issue", auctionDate: `March-0${n}-2026`, maturityDate: `June-0${n}-2026` }));
    const fewer = [classify({ id: 10, rateDescription: "Marginal" })];
    expect(defaultLabelKey(buildRateSeries([...many, ...fewer]))).toBe("Issue");
    expect(defaultLabelKey(buildRateSeries([classify({ id: 1, rateDescription: "Stop" }), classify({ id: 2, rateDescription: "Marginal" })]))).toBe("Marginal");
  });
  it("returns null when there is nothing to show", () => {
    expect(defaultLabelKey(buildRateSeries([]))).toBeNull();
  });
});