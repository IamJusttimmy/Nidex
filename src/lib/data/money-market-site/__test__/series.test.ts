import { describe, it, expect } from "vitest";
import { buildMmSeries, MM_CHART_OPTIONS, POLICY_SERIES_KEY } from "../series";
import type { MmObservation } from "../../money-market/pipeline/types";
import type { MmRateField, MmRateAssessment } from "../../money-market/quality/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAssessment(
  raw: string,
  value: number | null,
  status: MmRateAssessment["status"],
): MmRateAssessment {
  return { raw, value, status, reason: null };
}

function validRate(value: number): MmRateAssessment {
  return makeAssessment(String(value), value, "valid");
}

function notPublished(raw = ""): MmRateAssessment {
  return makeAssessment(raw, null, "not-published");
}

function suspicious(value: number): MmRateAssessment {
  return makeAssessment(String(value), value, "suspicious");
}

const FIELDS: MmRateField[] = [
  "mpr", "mrr", "interBankCallRate", "treasuryBill",
  "savingsDeposit", "oneMonthDeposit", "threeMonthsDeposit",
  "sixMonthsDeposit", "twelveMonthsDeposit", "primeLending", "maxLending",
];

function makeObs(
  period: string,
  overrides: Partial<Record<MmRateField, MmRateAssessment>> = {},
): MmObservation {
  const rates = {} as Record<MmRateField, MmRateAssessment>;
  for (const f of FIELDS) rates[f] = validRate(10);
  Object.assign(rates, overrides);
  return {
    id: 1,
    period,
    periodLabel: period,
    rates,
  };
}

// ---------------------------------------------------------------------------
// Policy series
// ---------------------------------------------------------------------------

describe("buildMmSeries — policy", () => {
  it("uses mrr value before 2006-12", () => {
    const obs = makeObs("2006-01", {
      mrr: validRate(13),
      mpr: notPublished("0.00"),
    });
    const series = buildMmSeries([obs], POLICY_SERIES_KEY);
    expect(series.points[0].value).toBe(13);
    expect(series.points[0].suspicious).toBe(false);
  });

  it("uses mpr value from 2006-12 onward", () => {
    const obs = makeObs("2006-12", {
      mrr: notPublished(""),
      mpr: validRate(10),
    });
    const series = buildMmSeries([obs], POLICY_SERIES_KEY);
    expect(series.points[0].value).toBe(10);
  });

  it("produces null for not-published slots", () => {
    const obs = makeObs("2006-06", {
      mrr: notPublished(""),
      mpr: notPublished("0.00"),
    });
    const series = buildMmSeries([obs], POLICY_SERIES_KEY);
    expect(series.points[0].value).toBeNull();
  });

  it("marks suspicious policy rate points", () => {
    const obs = makeObs("2007-01", {
      mrr: notPublished(""),
      mpr: suspicious(0),
    });
    const series = buildMmSeries([obs], POLICY_SERIES_KEY);
    expect(series.points[0].suspicious).toBe(true);
    expect(series.points[0].value).toBe(0);
  });

  it("returns the correct label and field key", () => {
    const series = buildMmSeries([], POLICY_SERIES_KEY);
    expect(series.field).toBe("policy");
    expect(series.label).toBe("Policy rate (MPR / MRR)");
  });

  it("includes a transition note", () => {
    const series = buildMmSeries([], POLICY_SERIES_KEY);
    expect(series.note).toContain("MRR");
    expect(series.note).toContain("MPR");
    expect(series.note).toContain("December 2006");
  });
});

// ---------------------------------------------------------------------------
// Field series
// ---------------------------------------------------------------------------

describe("buildMmSeries — field", () => {
  it("maps valid values to points", () => {
    const obs = makeObs("2026-09", { primeLending: validRate(19.04) });
    const series = buildMmSeries([obs], "primeLending");
    expect(series.points[0].value).toBe(19.04);
    expect(series.points[0].suspicious).toBe(false);
  });

  it("maps not-published to null value", () => {
    const obs = makeObs("2026-07", { interBankCallRate: notPublished("") });
    const series = buildMmSeries([obs], "interBankCallRate");
    expect(series.points[0].value).toBeNull();
    expect(series.points[0].suspicious).toBe(false);
  });

  it("maps suspicious to value with flag", () => {
    const obs = makeObs("2017-12", { treasuryBill: suspicious(0) });
    const series = buildMmSeries([obs], "treasuryBill");
    expect(series.points[0].value).toBe(0);
    expect(series.points[0].suspicious).toBe(true);
  });

  it("preserves period and periodLabel", () => {
    const obs = { ...makeObs("2020-06"), periodLabel: "June 2020" };
    const series = buildMmSeries([obs], "savingsDeposit");
    expect(series.points[0].period).toBe("2020-06");
    expect(series.points[0].periodLabel).toBe("June 2020");
  });

  it("returns all observations as points in order", () => {
    const obs = [
      makeObs("2006-01"),
      makeObs("2010-06"),
      makeObs("2026-09"),
    ];
    const series = buildMmSeries(obs, "maxLending");
    expect(series.points).toHaveLength(3);
    expect(series.points[0].period).toBe("2006-01");
    expect(series.points[2].period).toBe("2026-09");
  });
});

// ---------------------------------------------------------------------------
// Chart options
// ---------------------------------------------------------------------------

describe("MM_CHART_OPTIONS", () => {
  it("has policy rate as the first option", () => {
    expect(MM_CHART_OPTIONS[0].key).toBe("policy");
  });

  it("contains exactly 10 options (policy + 9 field indicators)", () => {
    // mpr and mrr are merged into policy; not separate options
    expect(MM_CHART_OPTIONS).toHaveLength(10);
  });

  it("does not include mpr or mrr as separate options", () => {
    const keys = MM_CHART_OPTIONS.map(o => o.key);
    expect(keys).not.toContain("mpr");
    expect(keys).not.toContain("mrr");
  });

  it("covers all four groups", () => {
    const groups = new Set(MM_CHART_OPTIONS.map(o => o.group));
    expect(groups).toContain("Monetary Policy");
    expect(groups).toContain("Money Market");
    expect(groups).toContain("Deposit Rates");
    expect(groups).toContain("Lending Rates");
  });
});