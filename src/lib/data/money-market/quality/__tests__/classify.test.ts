import { describe, it, expect } from "vitest";
import { classifyRate } from "../classify";
import { MM_RULES } from "../config";

describe("classifyRate", () => {
  // --- MPR pre-era ---
  it("marks mpr '0.00' before 2006-12 as not-published", () => {
    const r = classifyRate("mpr", "0.00", "2006-01", MM_RULES);
    expect(r.status).toBe("not-published");
    expect(r.reason).toBe("mpr_pre_era_zero");
    expect(r.value).toBeNull();
    expect(r.raw).toBe("0.00");
  });

  it("marks mpr '0.00' in 2006-11 as not-published", () => {
    expect(classifyRate("mpr", "0.00", "2006-11", MM_RULES).status).toBe("not-published");
  });

  it("marks mpr '14.00' in 2006-12 as valid", () => {
    const r = classifyRate("mpr", "14.00", "2006-12", MM_RULES);
    expect(r.status).toBe("valid");
    expect(r.value).toBe(14);
  });

  // --- MRR post-era ---
  it("marks mrr '' on 2006-12 as not-published", () => {
    const r = classifyRate("mrr", "", "2006-12", MM_RULES);
    expect(r.status).toBe("not-published");
    expect(r.reason).toBe("mrr_post_era_empty");
  });

  it("marks mrr '13.00' in 2006-01 as valid", () => {
    const r = classifyRate("mrr", "13.00", "2006-01", MM_RULES);
    expect(r.status).toBe("valid");
    expect(r.value).toBe(13);
  });

  // --- Interbank trailing empty ---
  it("marks interBankCallRate '' from 2026-03 as not-published", () => {
    const r = classifyRate("interBankCallRate", "", "2026-03", MM_RULES);
    expect(r.status).toBe("not-published");
    expect(r.reason).toBe("interbank_trailing_empty");
  });

  it("marks interBankCallRate '' before 2026-03 as not-published (unexpected)", () => {
    const r = classifyRate("interBankCallRate", "", "2020-06", MM_RULES);
    expect(r.status).toBe("not-published");
    expect(r.reason).toBe("rate_empty_unexpected");
  });

  // --- Zero outside known era ---
  it("marks interBankCallRate '0.00' as suspicious", () => {
    const r = classifyRate("interBankCallRate", "0.00", "2020-10", MM_RULES);
    expect(r.status).toBe("suspicious");
    expect(r.reason).toBe("rate_zero_suspicious");
    expect(r.value).toBe(0);
  });

  it("marks treasuryBill '0.00' as suspicious", () => {
    const r = classifyRate("treasuryBill", "0.00", "2017-12", MM_RULES);
    expect(r.status).toBe("suspicious");
    expect(r.reason).toBe("rate_zero_suspicious");
  });

  // --- Unparseable ---
  it("marks a non-numeric string as invalid", () => {
    const r = classifyRate("primeLending", "N/A", "2020-01", MM_RULES);
    expect(r.status).toBe("invalid");
    expect(r.reason).toBe("rate_unparseable");
    expect(r.value).toBeNull();
  });

  // --- Valid ---
  it("parses a normal rate as valid", () => {
    const r = classifyRate("primeLending", "19.04", "2026-09", MM_RULES);
    expect(r.status).toBe("valid");
    expect(r.value).toBe(19.04);
    expect(r.reason).toBeNull();
  });

  it("preserves the raw string unchanged", () => {
    const r = classifyRate("maxLending", "32.62", "2026-09", MM_RULES);
    expect(r.raw).toBe("32.62");
  });
});