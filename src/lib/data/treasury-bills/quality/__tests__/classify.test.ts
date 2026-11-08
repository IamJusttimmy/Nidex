import { describe, expect, it } from "vitest";
import { classifyRecord, DEFAULT_RULES, NTB_FIELDS, worstStatus, type NtbRules } from "../index";
import { classify, codes, rec } from "./helpers";

describe("a clean record", () => {
  it("passes every check with no reasons and no warnings", () => {
    const o = classify();
    for (const f of NTB_FIELDS) {
      expect(o.quality[f].status, f).toBe("valid");
      expect(o.quality[f].presence, f).toBe("published");
      expect(o.quality[f].reasons, f).toEqual([]);
    }
    expect(o.warnings).toEqual([]);
    expect(worstStatus(o)).toBe("valid");
    expect(o).toMatchObject({
      auctionDate: "2026-03-04",
      maturityDate: "2026-06-03",
      daysToMaturity: 91,
      rate: 15.4,
      trueYield: 16.0149,
      rangeBid: { low: 15, high: 16.15 },
      successfulBidRates: { low: 15, high: 15.4 },
      amtOffered: 100000,
      tenor: { labelDays: 91, group: 91 },
    });
  });
});

describe("raw values are preserved", () => {
  it("keeps the record exactly as received, frozen, and does not change the input", () => {
    const input = rec({ tenor: "91 DAYS ", rate: "15.4000", rateDescription: "Slop" });
    const copy = JSON.parse(JSON.stringify(input));
    Object.freeze(input);
    const o = classifyRecord(input);
    expect(o.raw).toEqual(copy);
    expect(Object.isFrozen(o.raw)).toBe(true);
    expect(input).toEqual(copy);
    expect(o.tenor.rawText).toBe("91 DAYS ");
  });
});

describe("zero and empty mean not published (rule: zero_means_missing)", () => {
  it("rate 0.0000 is not published, never zero", () => {
    const o = classify({ rate: "0.0000" });
    expect(o.rate).toBeNull();
    expect(o.quality.rate).toMatchObject({ status: "valid", presence: "not-published" });
    expect(codes(o, "rate")).toEqual(["not_published_zero"]);
  });
  it("true yield 0.0000 is not published, never zero", () => {
    const o = classify({ trueYield: "0.0000" });
    expect(o.trueYield).toBeNull();
    expect(o.quality.trueYield).toMatchObject({ status: "valid", presence: "not-published" });
    expect(codes(o, "trueYield")).toEqual(["not_published_zero"]);
    expect(o.raw.trueYield).toBe("0.0000");
  });
  it("zero amounts and empty amounts are not published", () => {
    const o = classify({ amtOffered: "", totalSubscription: "0.0000", totalSuccessful: "" });
    expect([o.amtOffered, o.totalSubscription, o.totalSuccessful]).toEqual([null, null, null]);
    expect(codes(o, "amtOffered")).toEqual(["not_published_empty"]);
    expect(codes(o, "totalSubscription")).toEqual(["not_published_zero"]);
    expect(codes(o, "totalSuccessful")).toEqual(["not_published_empty"]);
  });
  it("a zero bid range is not published", () => {
    const o = classify({ rangeBid: "0", successfulBidRates: "" });
    expect(o.rangeBid).toBeNull();
    expect(o.quality.rangeBid.presence).toBe("not-published");
    expect(o.quality.successfulBidRates.presence).toBe("not-published");
  });
  it("zero is only treated as missing for the configured fields", () => {
    const rules: NtbRules = { ...DEFAULT_RULES, zeroMeansMissing: ["trueYield"] };
    const o = classify({ rate: "0.0000", trueYield: "0.0000" }, rules);
    expect(o.rate).toBe(0);
    expect(o.trueYield).toBeNull();
  });
  it("true yield is never calculated to fill the gap", () => {
    const o = classify({ trueYield: "0.0000" });
    expect(o.trueYield).toBeNull();
  });
});

describe("number problems", () => {
  it("flags an unreadable number as invalid, keeping the other fields", () => {
    const o = classify({ rate: "15,4" });
    expect(o.quality.rate).toMatchObject({ status: "invalid", presence: "unparseable" });
    expect(o.quality.tenor.status).toBe("valid");
    expect(o.quality.maturityDate.status).toBe("valid");
  });
  it("flags a negative amount as invalid", () => {
    const o = classify({ totalSubscription: "-5.0000" });
    expect(o.quality.totalSubscription.status).toBe("invalid");
    expect(codes(o, "totalSubscription")).toContain("negative_value");
  });
  it("flags a rate above 100% as invalid (rate_implausible)", () => {
    const o = classify({ rate: "154.0000" });
    expect(o.quality.rate.status).toBe("invalid");
    expect(codes(o, "rate")).toContain("rate_implausible");
  });
  it("flags a true yield above 100% as invalid", () => {
    const o = classify({ trueYield: "1601.4900" });
    expect(o.quality.trueYield.status).toBe("invalid");
  });
});

describe("dates", () => {
  it("flags an unreadable auction date as invalid but still classifies the other fields", () => {
    const o = classify({ auctionDate: "Smarch-04-2026" });
    expect(o.auctionDate).toBeNull();
    expect(o.quality.auctionDate).toMatchObject({ status: "invalid", presence: "unparseable" });
    expect(o.quality.rate.status).toBe("valid");
    expect(o.daysToMaturity).toBeNull();
    expect(o.quality.maturityDate.status).toBe("valid"); // cannot be compared, not wrong on its own
  });
  it("flags an empty maturity date", () => {
    const o = classify({ maturityDate: "" });
    expect(o.quality.maturityDate).toMatchObject({ status: "invalid", presence: "not-published" });
  });
});

describe("tenor grouping", () => {
  it.each(["91DAY", "91Day", "91 DAY", "91 DAYS", "91 Days", "91", "91 "])("groups %j with the 91-day bills without a note", (t) => {
    const o = classify({ tenor: t });
    expect(o.tenor.group).toBe(91);
    expect(o.quality.tenor.reasons).toEqual([]);
  });
  it("keeps the original text next to the group", () => {
    const o = classify({ tenor: "182 Days", maturityDate: "September-02-2026" });
    expect(o.tenor).toEqual({ rawText: "182 Days", labelDays: 182, group: 182 });
  });
  it.each([
    ["90 DAY", 91],
    ["181 DAY", 182],
    ["363 DAY", 364],
    ["365Day", 364],
  ] as const)("groups the holiday-week label %j with the %i-day bills and notes it", (t, group) => {
    const o = classify({ tenor: t });
    expect(o.tenor.group).toBe(group);
    expect(o.quality.tenor.status).toBe("valid");
    expect(codes(o, "tenor")).toEqual(["tenor_label_variant"]);
  });
  it.each(["3", "49", "344", "358"])("flags the non-standard tenor %j as suspicious and gives it no group", (t) => {
    const o = classify({ tenor: t });
    expect(o.tenor.group).toBeNull();
    expect(o.quality.tenor.status).toBe("suspicious");
    expect(codes(o, "tenor")).toEqual(["tenor_not_standard"]);
  });
  it("flags unreadable and empty tenors as invalid", () => {
    expect(classify({ tenor: "n/a" }).quality.tenor).toMatchObject({ status: "invalid", presence: "unparseable" });
    expect(classify({ tenor: "" }).quality.tenor).toMatchObject({ status: "invalid", presence: "not-published" });
  });
});

describe("maturity date", () => {
  it("is invalid when it is not after the auction date (maturity_not_after_auction)", () => {
    for (const m of ["March-04-2026", "June-03-2025"]) {
      const o = classify({ maturityDate: m });
      expect(o.quality.maturityDate.status).toBe("invalid");
      expect(codes(o, "maturityDate")).toEqual(["maturity_not_after_auction"]);
    }
  });
  it("is suspicious when it does not fit the tenor (maturity_inconsistent_with_tenor)", () => {
    const o = classify({ maturityDate: "September-02-2026" }); // 182 days on a 91-day bill
    expect(o.quality.maturityDate.status).toBe("suspicious");
    expect(codes(o, "maturityDate")).toEqual(["maturity_inconsistent_with_tenor"]);
    expect(o.daysToMaturity).toBe(182);
  });
  it("adds the yield as evidence when the yield fits the stated tenor, without changing the date", () => {
    const o = classify({ maturityDate: "September-02-2026" });
    const r = o.quality.maturityDate.reasons[0];
    expect(r?.detail?.yieldFitsTenor).toBe(true);
    expect(r?.message).toContain("supports the tenor");
    expect(o.maturityDate).toBe("2026-09-02");
  });
  it("makes no claim about the yield when it is not published", () => {
    const o = classify({ maturityDate: "September-02-2026", trueYield: "0.0000" });
    const r = o.quality.maturityDate.reasons[0];
    expect(r?.detail?.yieldFitsTenor).toBeNull();
    expect(r?.message).not.toContain("supports");
  });
  it.each([
    ["June-02-2026", 90],
    ["June-03-2026", 91],
    ["June-04-2026", 92],
  ])("accepts %s (%i days) for a 91-day bill", (m) => {
    expect(classify({ maturityDate: m }).quality.maturityDate.status).toBe("valid");
  });
  it("rejects 93 days for a 91-day bill and 89 days", () => {
    expect(classify({ maturityDate: "June-05-2026" }).quality.maturityDate.status).toBe("suspicious");
    expect(classify({ maturityDate: "June-01-2026" }).quality.maturityDate.status).toBe("suspicious");
  });
  it("is not compared with a tenor that has no group", () => {
    const o = classify({ tenor: "344", maturityDate: "February-07-2027" });
    expect(o.quality.maturityDate.status).toBe("valid");
  });
  it("a bad maturity date never stops the rate, yield or amounts being usable", () => {
    const o = classify({ maturityDate: "March-01-2026" });
    expect(o.quality.maturityDate.status).toBe("invalid");
    for (const f of ["rate", "trueYield", "amtOffered", "totalSubscription", "totalSuccessful", "rangeBid", "successfulBidRates", "tenor"] as const) {
      expect(o.quality[f].status, f).toBe("valid");
    }
    expect(o.rate).toBe(15.4);
  });
});

describe("true yield against the published rate", () => {
  it("is suspicious when it differs from what the rate implies (true_yield_inconsistent_with_rate)", () => {
    const o = classify({ trueYield: "15.4000" }); // yield copied from the rate
    expect(o.quality.trueYield.status).toBe("suspicious");
    expect(codes(o, "trueYield")).toEqual(["true_yield_inconsistent_with_rate"]);
    expect(o.quality.trueYield.reasons[0]?.detail).toMatchObject({ trueYield: 15.4, expected: 16.0149, days: 91 });
    expect(o.trueYield).toBe(15.4);
    expect(o.quality.rate.status).toBe("valid");
  });
  it("accepts a small rounding difference", () => {
    expect(classify({ trueYield: "16.0449" }).quality.trueYield.status).toBe("valid"); // +0.03
    expect(classify({ trueYield: "16.0750" }).quality.trueYield.status).toBe("suspicious"); // +0.06
  });
  it("does not call a yield equal to the rate suspicious when the rate is tiny", () => {
    const o = classify({ rate: "0.0350", trueYield: "0.0350", rangeBid: "0.0300 - 0.0400", successfulBidRates: "0.0300 - 0.0350" });
    expect(o.quality.trueYield.status).toBe("valid");
  });
  it("is not judged when the rate is not published or the tenor has no group", () => {
    expect(classify({ rate: "0.0000", trueYield: "99.0000" }).quality.trueYield.status).toBe("valid");
    expect(classify({ tenor: "344", maturityDate: "February-07-2027", trueYield: "50.0000" }).quality.trueYield.status).toBe("valid");
  });
  it("uses the standard tenor for a holiday-week label", () => {
    const o = classify({ tenor: "363 DAY", maturityDate: "March-03-2027", rate: "22.9000", trueYield: "29.6775", rangeBid: "20.0000 - 23.0000", successfulBidRates: "20.0000 - 22.9000" });
    expect(o.tenor.group).toBe(364);
    expect(o.quality.trueYield.status).toBe("valid");
  });
});

describe("rate against the bid ranges", () => {
  it("is suspicious when it is outside the range of bids (rate_outside_bid_range)", () => {
    const o = classify({ rate: "17.0000", trueYield: "17.7400" });
    expect(o.quality.rate.status).toBe("suspicious");
    expect(codes(o, "rate")).toContain("rate_outside_bid_range");
  });
  it("accepts a rate that sits a rounding amount outside the range", () => {
    expect(classify({ rate: "16.1550", trueYield: "0.0000" }).quality.rate.status).toBe("valid");
  });
  it("is not judged against a range that is itself invalid", () => {
    const o = classify({ rangeBid: "15.0000 - 196300", rate: "17.0000", trueYield: "0.0000" });
    expect(o.quality.rangeBid.status).toBe("invalid");
    expect(o.quality.rate.status).toBe("valid");
  });
  it("is not judged when the range is not published", () => {
    expect(classify({ rangeBid: "", rate: "50.0000", trueYield: "0.0000" }).quality.rate.status).toBe("valid");
  });
  it("warns, without changing any status, when the rate is not the top successful bid", () => {
    const o = classify({ successfulBidRates: "15.0000 - 15.9000" });
    expect(o.quality.rate.status).toBe("valid");
    expect(o.quality.successfulBidRates.status).toBe("valid");
    expect(o.warnings.map((w) => w.code)).toEqual(["rate_differs_from_top_successful_bid"]);
  });
});

describe("rate label", () => {
  it("keeps the original label and adds the standardised one", () => {
    const o = classify({ rateDescription: "Maginal" });
    expect(o.rateLabel).toEqual({ raw: "Maginal", display: "Marginal" });
    expect(o.quality.rateLabel.status).toBe("valid");
    expect(codes(o, "rateLabel")).toEqual(["rate_label_standardised"]);
  });
  it("makes no note when the label is already standard", () => {
    const o = classify({ rateDescription: "Stop" });
    expect(o.rateLabel).toEqual({ raw: "Stop", display: "Stop" });
    expect(o.quality.rateLabel.reasons).toEqual([]);
  });
  it("shows no standard label for an unknown one, and flags it", () => {
    const o = classify({ rateDescription: "Weighted" });
    expect(o.rateLabel).toEqual({ raw: "Weighted", display: null });
    expect(o.quality.rateLabel.status).toBe("suspicious");
    expect(codes(o, "rateLabel")).toEqual(["rate_label_unrecognised"]);
  });
  it("treats an empty label as not published", () => {
    expect(classify({ rateDescription: "" }).quality.rateLabel.presence).toBe("not-published");
  });
});

describe("bid ranges", () => {
  it("flags a rate above 100% in a range as invalid (bid_rate_implausible)", () => {
    const o = classify({ successfulBidRates: "15.0000 - 196300" });
    expect(o.quality.successfulBidRates.status).toBe("invalid");
    expect(codes(o, "successfulBidRates")).toContain("bid_rate_implausible");
    expect(o.quality.rangeBid.status).toBe("valid");
  });
  it("flags a reversed range as invalid (bid_range_reversed)", () => {
    const o = classify({ successfulBidRates: "2.4400-2.2440" });
    expect(o.quality.successfulBidRates.status).toBe("invalid");
    expect(codes(o, "successfulBidRates")).toContain("bid_range_reversed");
  });
  it("keeps an unreadable range as unparseable and leaves the rest alone", () => {
    const o = classify({ rangeBid: "3.3880 - 12 8000" });
    expect(o.rangeBid).toBeNull();
    expect(o.quality.rangeBid).toMatchObject({ status: "invalid", presence: "unparseable" });
    expect(o.quality.rate.status).toBe("valid");
    expect(o.raw.rangeBid).toBe("3.3880 - 12 8000");
  });
  it("notes a single published rate", () => {
    const o = classify({ rangeBid: "15.4000%" });
    expect(o.rangeBid).toEqual({ low: 15.4, high: 15.4 });
    expect(o.quality.rangeBid.status).toBe("valid");
    expect(codes(o, "rangeBid")).toEqual(["bid_range_single_value"]);
  });
  it("flags successful bids outside the range of all bids (successful_range_outside_bid_range)", () => {
    const o = classify({ rangeBid: "15.0000 - 16.0000", successfulBidRates: "15.0000 - 18.0000" });
    expect(o.quality.successfulBidRates.status).toBe("suspicious");
    expect(codes(o, "successfulBidRates")).toContain("successful_range_outside_bid_range");
    expect(o.quality.rangeBid.status).toBe("valid");
  });
  it("accepts successful bids at the edge of the range", () => {
    expect(classify({ rangeBid: "15.0000 - 15.4000", successfulBidRates: "15.0000 - 15.4000" }).quality.successfulBidRates.status).toBe("valid");
  });
});

describe("amounts", () => {
  it("flags both fields when the allotment is larger than the subscription (allotment_exceeds_subscription)", () => {
    const o = classify({ totalSubscription: "8129.7180", totalSuccessful: "71613.7180" });
    for (const f of ["totalSubscription", "totalSuccessful"] as const) {
      expect(o.quality[f].status, f).toBe("suspicious");
      expect(codes(o, f), f).toEqual(["allotment_exceeds_subscription"]);
    }
    expect(o.totalSuccessful).toBe(71613.718);
    expect(o.quality.amtOffered.status).toBe("valid");
  });
  it("does not flag an allotment equal to the subscription, or one larger than the amount offered", () => {
    expect(classify({ amtOffered: "100.0000", totalSubscription: "100.0000", totalSuccessful: "100.0000" }).quality.totalSuccessful.status).toBe("valid");
    expect(classify({ amtOffered: "50.0000", totalSubscription: "900.0000", totalSuccessful: "800.0000" }).quality.totalSuccessful.status).toBe("valid");
  });
  it("flags all three amounts when they are on very different scales (amount_scale_inconsistent)", () => {
    // real shape of the 12 Aug 2026 records: offer 500,000 against 4,188,416,475 of bids
    const o = classify({ amtOffered: "500000.0000", totalSubscription: "4188416475.0000", totalSuccessful: "1260000000.0000" });
    for (const f of ["amtOffered", "totalSubscription", "totalSuccessful"] as const) {
      expect(o.quality[f].status, f).toBe("suspicious");
      expect(codes(o, f), f).toEqual(["amount_scale_inconsistent"]);
    }
    expect(o.quality.totalSuccessful.reasons[0]?.detail).toMatchObject({ amtOffered: 500000, ratio: 8376.833 });
    // the published values are untouched
    expect(o.totalSuccessful).toBe(1260000000);
    expect(o.raw.totalSuccessful).toBe("1260000000.0000");
  });
  it("catches an offer written in a larger unit than the bids (offer far too small)", () => {
    const o = classify({ amtOffered: "5.0000", totalSubscription: "7195.9800", totalSuccessful: "5000.0000" });
    expect(codes(o, "amtOffered")).toEqual(["amount_scale_inconsistent"]);
  });
  it("catches an offer far too large for the bids", () => {
    const o = classify({ amtOffered: "5000000.0000", totalSubscription: "900.0000", totalSuccessful: "800.0000" });
    expect(codes(o, "totalSubscription")).toEqual(["amount_scale_inconsistent"]);
  });
  it("leaves ordinary heavy over-subscription alone (under the ratio)", () => {
    const o = classify({ amtOffered: "1000.0000", totalSubscription: "400000.0000", totalSuccessful: "3000.0000" });
    for (const f of ["amtOffered", "totalSubscription", "totalSuccessful"] as const) expect(o.quality[f].status, f).toBe("valid");
  });
  it("applies the configured ratio", () => {
    const strict = { ...DEFAULT_RULES, amountScaleRatio: 50 };
    const o = classifyRecord(rec({ amtOffered: "1000.0000", totalSubscription: "400000.0000", totalSuccessful: "3000.0000" }), strict);
    expect(codes(o, "amtOffered")).toEqual(["amount_scale_inconsistent"]);
  });
  it("is not applied when one of the three amounts is not published", () => {
    const o = classify({ amtOffered: "", totalSubscription: "4188416475.0000", totalSuccessful: "1260000000.0000" });
    expect(codes(o, "totalSubscription")).toEqual([]);
  });
  it("is not compared when one value is not published", () => {
    expect(classify({ totalSubscription: "", totalSuccessful: "500.0000" }).quality.totalSuccessful.status).toBe("valid");
  });
  it("keeps the unit marked as unconfirmed and the amounts as plain numbers", () => {
    const o = classify();
    expect(o.amountUnit).toBe("unconfirmed");
    expect(o.amtOffered).toBe(100000);
    expect(DEFAULT_RULES.amountUnit).toEqual({ status: "unconfirmed", hypothesis: "millions of naira (not verified)" });
  });
});

describe("fields are classified independently", () => {
  it("one record can be invalid in one field and fully usable in the others", () => {
    const o = classify({ rate: "154.0000", maturityDate: "March-01-2026", amtOffered: "10.0000", totalSubscription: "1.0000", totalSuccessful: "2.0000" });
    const statuses = Object.fromEntries(NTB_FIELDS.map((f) => [f, o.quality[f].status]));
    expect(statuses).toMatchObject({
      rate: "invalid",
      maturityDate: "invalid",
      totalSubscription: "suspicious",
      totalSuccessful: "suspicious",
      auctionDate: "valid",
      tenor: "valid",
      rangeBid: "valid",
      successfulBidRates: "valid",
      amtOffered: "valid",
      rateLabel: "valid",
    });
    expect(worstStatus(o)).toBe("invalid");
  });
});