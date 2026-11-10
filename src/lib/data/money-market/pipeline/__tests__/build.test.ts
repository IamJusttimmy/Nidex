import { describe, it, expect } from "vitest";
import { buildDocument } from "../build";
import type { MmSourceRecord } from "../types";

function makeRecord(overrides: Partial<MmSourceRecord> & { tyear: number; tmonth: number }): MmSourceRecord {
  const { tyear, tmonth, ...rest } = overrides;
  return {
    id: tmonth,
    tyear,
    tmonth,
    period: `Month ${tmonth} ${tyear}`,
    interBankCallRate: "10.00",
    mrr: "",
    mpr: "14.00",
    treasuryBill: "12.00",
    savingsDeposit: "4.00",
    oneMonthDeposit: "9.00",
    threeMonthsDeposit: "9.50",
    sixMonthsDeposit: "8.50",
    twelveMonthsDeposit: "9.00",
    primeLending: "17.00",
    maxLending: "28.00",
    ...rest,
  };
}

const RETRIEVED = "2026-11-10T12:00:00.000Z";

describe("buildDocument", () => {
  it("sorts observations oldest first", () => {
    const records = [
      makeRecord({ tyear: 2026, tmonth: 9 }),
      makeRecord({ tyear: 2006, tmonth: 1, mpr: "0.00", mrr: "13.00" }),
      makeRecord({ tyear: 2020, tmonth: 6 }),
    ];
    const doc = buildDocument(records, RETRIEVED);
    expect(doc.observations[0].period).toBe("2006-01");
    expect(doc.observations[2].period).toBe("2026-09");
  });

  it("sets coverage from first and last observation", () => {
    const records = [
      makeRecord({ tyear: 2026, tmonth: 9 }),
      makeRecord({ tyear: 2006, tmonth: 1, mpr: "0.00", mrr: "13.00" }),
    ];
    const doc = buildDocument(records, RETRIEVED);
    expect(doc.coverage.firstPeriod).toBe("2006-01");
    expect(doc.coverage.lastPeriod).toBe("2026-09");
    expect(doc.coverage.totalRecords).toBe(2);
  });

  it("counts fully valid observations", () => {
    const records = [makeRecord({ tyear: 2026, tmonth: 9 })];
    const doc = buildDocument(records, RETRIEVED);
    // mrr is "" after 2006-12 → not-published (expected), all others valid
    expect(doc.quality.withInvalid).toBe(0);
    expect(doc.quality.withSuspicious).toBe(0);
    expect(doc.quality.fullyValid).toBe(1);
  });

  it("counts suspicious observations", () => {
    const records = [
      makeRecord({ tyear: 2017, tmonth: 12, treasuryBill: "0.00" }),
    ];
    const doc = buildDocument(records, RETRIEVED);
    expect(doc.quality.withSuspicious).toBe(1);
    expect(doc.quality.fullyValid).toBe(0);
  });

  it("fires mpr_pre_era_zero rule for pre-2006-12 records", () => {
    const records = [
      makeRecord({ tyear: 2006, tmonth: 1, mpr: "0.00", mrr: "13.00" }),
    ];
    const doc = buildDocument(records, RETRIEVED);
    const rule = doc.quality.rulesFired.find(r => r.rule === "mpr_pre_era_zero");
    expect(rule).toBeDefined();
    expect(rule!.count).toBe(1);
    expect(rule!.field).toBe("mpr");
  });

  it("sets source metadata", () => {
    const doc = buildDocument([makeRecord({ tyear: 2026, tmonth: 9 })], RETRIEVED);
    expect(doc.source.publisher).toBe("Central Bank of Nigeria");
    expect(doc.source.retrievedAt).toBe(RETRIEVED);
    expect(doc.source.rulesVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("preserves raw values unchanged", () => {
    const records = [makeRecord({ tyear: 2026, tmonth: 9, mpr: "23.00" })];
    const doc = buildDocument(records, RETRIEVED);
    expect(doc.observations[0].rates.mpr.raw).toBe("23.00");
  });
});