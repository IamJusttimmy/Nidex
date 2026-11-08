import { describe, expect, it } from "vitest";
import { buildNtbQualityReport, isFieldUsable, isMaturityDateUsable, isRateSeriesEligible } from "../index";
import { classify, series91 } from "./helpers";

describe("isRateSeriesEligible: only the rate field decides", () => {
  it("accepts a clean observation", () => {
    expect(isRateSeriesEligible(classify())).toBe(true);
  });

  it("keeps a valid rate whose maturity date is suspicious (does not match the tenor)", () => {
    // a 91-day bill with a maturity date 182 days out: the real shape of 82 records from 2002 to 2004
    const o = classify({ maturityDate: "September-02-2026" });
    expect(o.quality.maturityDate.status).toBe("suspicious");
    expect(isMaturityDateUsable(o)).toBe(false);
    expect(o.quality.rate.status).toBe("valid");
    expect(isRateSeriesEligible(o)).toBe(true);
  });

  it("keeps a valid rate whose maturity date is invalid (on or before the auction)", () => {
    const o = classify({ maturityDate: "March-04-2026" });
    expect(o.quality.maturityDate.status).toBe("invalid");
    expect(isMaturityDateUsable(o)).toBe(false);
    expect(isRateSeriesEligible(o)).toBe(true);
  });

  it("keeps a valid rate when the true yield, amounts, bid ranges or rate label are flagged", () => {
    const cases = {
      "true yield inconsistent": classify({ trueYield: "20.0000" }),
      "amounts on different scales": classify({ amtOffered: "100.0000", totalSubscription: "162210976.0000", totalSuccessful: "148565439.0000" }),
      "allotment above subscription": classify({ totalSubscription: "10.0000", totalSuccessful: "20.0000", amtOffered: "10.0000" }),
      "bid range unreadable": classify({ rangeBid: "18.6000 - 196300" }),
      "successful range corrupted": classify({ successfulBidRates: "15.0000 - 196300" }),
      "unrecognised rate label": classify({ rateDescription: "Weighted" }),
    };
    for (const [name, o] of Object.entries(cases)) {
      expect(o.quality.rate.status, name).toBe("valid");
      expect(isRateSeriesEligible(o), name).toBe(true);
    }
    // and each of those cases really did flag the field it was meant to
    expect(cases["true yield inconsistent"].quality.trueYield.status).toBe("suspicious");
    expect(cases["amounts on different scales"].quality.totalSuccessful.status).toBe("suspicious");
    expect(cases["bid range unreadable"].quality.rangeBid.status).toBe("invalid");
  });

  it("excludes an observation whose rate is not published", () => {
    const o = classify({ rate: "0.0000" });
    expect(o.quality.rate.presence).toBe("not-published");
    expect(isRateSeriesEligible(o)).toBe(false);
    expect(isRateSeriesEligible(o, { includeSuspicious: true })).toBe(false);
  });

  it("excludes a suspicious rate by default and includes it only when the viewer asks", () => {
    const o = buildNtbQualityReport(series91([15, 15.2, 8, 15.1, 15.3])).observations.find((x) => x.id === 102)!;
    expect(o.quality.rate.status).toBe("suspicious");
    expect(isRateSeriesEligible(o)).toBe(false);
    expect(isRateSeriesEligible(o, { includeSuspicious: true })).toBe(true);
  });

  it("never includes an invalid rate", () => {
    const o = classify({ rate: "154.0000" });
    expect(o.quality.rate.status).toBe("invalid");
    expect(isRateSeriesEligible(o, { includeSuspicious: true })).toBe(false);
  });

  it("excludes a tenor that is not a standard bill, because it has no series to join", () => {
    expect(isRateSeriesEligible(classify({ tenor: "49" }))).toBe(false);
  });

  it("groups a holiday-week label with its standard tenor", () => {
    expect(isRateSeriesEligible(classify({ tenor: "90 DAY" }))).toBe(true);
  });
});

describe("the spike rule does not let maturity flags change a series", () => {
  it("still flags the spike when its neighbours have bad maturity dates", () => {
    const raws = series91([15, 15.2, 8, 15.1, 15.3]);
    raws[1] = { ...raws[1]!, maturityDate: "January-01-2025" }; // before its own auction: invalid maturity
    raws[3] = { ...raws[3]!, maturityDate: "December-31-2030" }; // years from the tenor: suspicious maturity
    const { observations } = buildNtbQualityReport(raws);
    expect(observations.find((o) => o.id === 101)!.quality.maturityDate.status).toBe("invalid");
    expect(observations.find((o) => o.id === 103)!.quality.maturityDate.status).not.toBe("valid");
    expect(observations.filter((o) => o.quality.rate.reasons.some((r) => r.code === "rate_spike_reversion")).map((o) => o.id)).toEqual([102]);
    // the two neighbours stay in the series
    expect(isRateSeriesEligible(observations.find((o) => o.id === 101)!)).toBe(true);
    expect(isRateSeriesEligible(observations.find((o) => o.id === 103)!)).toBe(true);
  });

  it("gives identical rate statuses whatever the maturity dates say", () => {
    const clean = buildNtbQualityReport(series91([15, 15.2, 8, 15.1, 15.3, 15.4])).observations;
    const broken = buildNtbQualityReport(
      series91([15, 15.2, 8, 15.1, 15.3, 15.4]).map((r, i) => ({ ...r, maturityDate: i % 2 ? "January-01-2020" : "June-01-2031" })),
    ).observations;
    expect(broken.map((o) => o.quality.rate)).toEqual(clean.map((o) => o.quality.rate));
    expect(broken.map((o) => isRateSeriesEligible(o))).toEqual(clean.map((o) => isRateSeriesEligible(o)));
  });
});

describe("isFieldUsable", () => {
  it("needs a published value that passed every check", () => {
    expect(isFieldUsable(classify(), "trueYield")).toBe(true);
    expect(isFieldUsable(classify({ trueYield: "0.0000" }), "trueYield")).toBe(false); // not published
    expect(isFieldUsable(classify({ trueYield: "20.0000" }), "trueYield")).toBe(false); // suspicious
  });
});

describe("the original rate label stays with every observation", () => {
  const labels = ["Issue", "Maginal", "Slop", "Stop", "Issue Rates", "Weighted"];
  const observations = buildNtbQualityReport(
    labels.map((rateDescription, i) => ({ ...series91([15 + i * 0.01], `2025-0${i + 1}-01`)[0]!, id: 200 + i, rateDescription })),
  ).observations;

  it("keeps the raw label and the display label side by side, and never turns them into one series", () => {
    expect(observations.map((o) => o.rateLabel.raw)).toEqual(labels);
    expect(observations.map((o) => o.rateLabel.display)).toEqual(["Issue", "Marginal", "Stop", "Stop", "Issue", null]);
    // six different published labels stay six different labels (nothing is merged)
    expect(new Set(observations.map((o) => o.rateLabel.raw)).size).toBe(labels.length);
  });

  it("does not let the label decide eligibility, and does not hide an unrecognised label", () => {
    expect(observations.every((o) => isRateSeriesEligible(o))).toBe(true);
    const weighted = observations.find((o) => o.rateLabel.raw === "Weighted")!;
    expect(weighted.quality.rateLabel.status).not.toBe("valid"); // the label is questioned
    expect(weighted.rateLabel.raw).toBe("Weighted"); // but still shown as published
  });
});