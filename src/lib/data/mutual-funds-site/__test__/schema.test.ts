import { describe, it, expect } from "vitest";
import { mutualFundsSchema } from "../schema";

const absent = { raw: null, value: null, status: "not-published", reason: "field_absent_for_format" };
const validNav = { raw: "1000000", value: 1000000, status: "valid", reason: null };

function makeDoc(overrides = {}) {
  return {
    retrievedAt: "2026-11-12T00:00:00.000Z",
    schemaVersion: "1",
    rules: { version: "2026-11-11.1" },
    observations: [],
    quality: {
      total: 0,
      byStatus: { valid: 0, "not-published": 0, suspicious: 0, invalid: 0 },
      rulesFired: {},
      lastReportingDate: "",
      weekCount: 0,
      fundCount: 0,
    },
    ...overrides,
  };
}

function makeObs(overrides = {}) {
  return {
    id: "2026-10-23__fund_a",
    reportingDate: "2026-10-23",
    fundName: "Fund A",
    fundManager: null,
    category: null,
    fields: {
      navNgn: validNav,
      navUsd: absent,
      unitPriceNgn: absent,
      offerPriceNgn: absent,
      offerPriceUsd: absent,
      bidPriceNgn: absent,
      bidPriceUsd: absent,
      unitholders: absent,
      yieldWtd: absent,
      yieldYtd: absent,
    },
    sourceFile: "test.xlsx",
    sourceFormat: "2011",
    ...overrides,
  };
}

describe("mutualFundsSchema", () => {
  it("accepts a valid empty document", () => {
    expect(mutualFundsSchema.safeParse(makeDoc()).success).toBe(true);
  });

  it("accepts a document with a valid observation", () => {
    const doc = makeDoc({ observations: [makeObs()] });
    expect(mutualFundsSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects an unknown schemaVersion", () => {
    expect(mutualFundsSchema.safeParse(makeDoc({ schemaVersion: "2" })).success).toBe(false);
  });

  it("rejects an observation with an unknown sourceFormat", () => {
    const doc = makeDoc({ observations: [makeObs({ sourceFormat: "2024" })] });
    expect(mutualFundsSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects an observation with an unknown reason code", () => {
    const doc = makeDoc({
      observations: [makeObs({ fields: { ...makeObs().fields, navNgn: { ...validNav, reason: "made_up_code" } } })],
    });
    expect(mutualFundsSchema.safeParse(doc).success).toBe(false);
  });
});