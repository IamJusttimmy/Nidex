import { describe, expect, it } from "vitest";
import {
  buildNtbQualityReport,
  REASON_CODES,
  REJECTION_KINDS,
  WARNING_CODES,
  type NtbField,
  type NtbObservation,
  type RejectionKind,
  type ReasonCode,
  type WarningCode,
} from "../index";
import { classify, rec, series91 } from "./helpers";

/**
 * Every rule must be shown to fire. These tables are typed with Record<...>, so adding a new
 * reason code, warning or rejection kind without adding a trigger here is a compile error.
 */
const REASON_TRIGGERS: Record<ReasonCode, () => { field: NtbField; observations: NtbObservation[] }> = {
  not_published_empty: () => ({ field: "amtOffered", observations: [classify({ amtOffered: "" })] }),
  not_published_zero: () => ({ field: "trueYield", observations: [classify({ trueYield: "0.0000" })] }),
  unparseable: () => ({ field: "rate", observations: [classify({ rate: "abc" })] }),
  negative_value: () => ({ field: "totalSubscription", observations: [classify({ totalSubscription: "-1.0000" })] }),
  tenor_label_variant: () => ({ field: "tenor", observations: [classify({ tenor: "90 DAY" })] }),
  tenor_not_standard: () => ({ field: "tenor", observations: [classify({ tenor: "49" })] }),
  maturity_not_after_auction: () => ({ field: "maturityDate", observations: [classify({ maturityDate: "March-04-2026" })] }),
  maturity_inconsistent_with_tenor: () => ({ field: "maturityDate", observations: [classify({ maturityDate: "September-02-2026" })] }),
  rate_implausible: () => ({ field: "rate", observations: [classify({ rate: "154.0000" })] }),
  rate_outside_bid_range: () => ({ field: "rate", observations: [classify({ rate: "17.0000" })] }),
  rate_spike_reversion: () => ({ field: "rate", observations: buildNtbQualityReport(series91([15, 15.2, 8, 15.1, 15.3])).observations }),
  rate_label_standardised: () => ({ field: "rateLabel", observations: [classify({ rateDescription: "Slop" })] }),
  rate_label_unrecognised: () => ({ field: "rateLabel", observations: [classify({ rateDescription: "Weighted" })] }),
  true_yield_inconsistent_with_rate: () => ({ field: "trueYield", observations: [classify({ trueYield: "15.4000" })] }),
  bid_rate_implausible: () => ({ field: "successfulBidRates", observations: [classify({ successfulBidRates: "15.0000 - 196300" })] }),
  bid_range_reversed: () => ({ field: "successfulBidRates", observations: [classify({ successfulBidRates: "2.4400-2.2440" })] }),
  bid_range_single_value: () => ({ field: "rangeBid", observations: [classify({ rangeBid: "15.4000%" })] }),
  successful_range_outside_bid_range: () => ({ field: "successfulBidRates", observations: [classify({ rangeBid: "15.0000 - 16.0000", successfulBidRates: "15.0000 - 18.0000" })] }),
  amount_scale_inconsistent: () => ({ field: "amtOffered", observations: [classify({ amtOffered: "100000.0000", totalSubscription: "162210976.0000", totalSuccessful: "148565439.0000" })] }),
  allotment_exceeds_subscription: () => ({ field: "totalSuccessful", observations: [classify({ totalSubscription: "10.0000", totalSuccessful: "20.0000" })] }),
};

const WARNING_TRIGGERS: Record<WarningCode, () => NtbObservation[]> = {
  rate_differs_from_top_successful_bid: () => [classify({ successfulBidRates: "15.0000 - 15.9000" })],
  conflicting_duplicate_auction: () => buildNtbQualityReport([rec({ id: 1 }), rec({ id: 2, rate: "15.5000" })]).observations,
};

const REJECTION_TRIGGERS: Record<RejectionKind, () => RejectionKind[]> = {
  not_an_object: () => buildNtbQualityReport(["x"]).rejected.map((r) => r.kind),
  invalid_id: () => buildNtbQualityReport([{ ...rec(), id: "7" }]).rejected.map((r) => r.kind),
  duplicate_id: () => buildNtbQualityReport([rec({ id: 1 }), rec({ id: 1, rate: "16.0000" })]).rejected.map((r) => r.kind),
  security_type_not_ntb: () => buildNtbQualityReport([rec({ securityType: "OMO" })]).rejected.map((r) => r.kind),
  duplicate_content: () => buildNtbQualityReport([rec({ id: 1 }), rec({ id: 2 })]).rejected.map((r) => r.kind),
};

describe("every rule fires", () => {
  it.each(REASON_CODES)("reason code %s", (code) => {
    const { field, observations } = REASON_TRIGGERS[code]();
    expect(observations.some((o) => o.quality[field].reasons.some((r) => r.code === code))).toBe(true);
  });
  it.each(WARNING_CODES)("warning %s", (code) => {
    expect(WARNING_TRIGGERS[code]().some((o) => o.warnings.some((w) => w.code === code))).toBe(true);
  });
  it.each(REJECTION_KINDS)("rejection %s", (kind) => {
    expect(REJECTION_TRIGGERS[kind]()).toContain(kind);
  });
  it("every reason has a plain-language message", () => {
    for (const code of REASON_CODES) {
      const { field, observations } = REASON_TRIGGERS[code]();
      const reasons = observations.flatMap((o) => o.quality[field].reasons).filter((r) => r.code === code);
      expect(reasons.length, code).toBeGreaterThan(0);
      for (const r of reasons) expect(r.message.length, code).toBeGreaterThan(10);
    }
  });
});