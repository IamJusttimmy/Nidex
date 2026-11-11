import { describe, it, expect } from "vitest";
import { classifyField, absentNavAssessment } from "../classify";
import { MF_RULES } from "../config";

describe("classifyField", () => {
  it("returns not-published for a field absent in the given format", () => {
    const result = classifyField("navUsd", "12345", "2011", MF_RULES);
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("field_absent_for_format");
    expect(result.raw).toBeNull();
  });

  it("returns not-published for a blank cell", () => {
    const result = classifyField("navNgn", "", "2026", MF_RULES);
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("value_blank");
  });

  it("returns not-published for a dash cell", () => {
    const result = classifyField("navNgn", "-", "2026", MF_RULES);
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("value_blank");
  });

  it("returns not-published for null", () => {
    const result = classifyField("navNgn", null, "2026", MF_RULES);
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("value_blank");
  });

  it("returns invalid for a non-numeric string", () => {
    const result = classifyField("navNgn", "N/A", "2026", MF_RULES);
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("value_unparseable");
    expect(result.value).toBeNull();
  });

  it("returns suspicious for a negative value", () => {
    const result = classifyField("navNgn", "-500", "2026", MF_RULES);
    expect(result.status).toBe("suspicious");
    expect(result.reason).toBe("value_negative");
    expect(result.value).toBe(-500);
  });

  it("returns suspicious for zero", () => {
    const result = classifyField("navNgn", "0", "2026", MF_RULES);
    expect(result.status).toBe("suspicious");
    expect(result.reason).toBe("value_zero_suspicious");
    expect(result.value).toBe(0);
  });

  it("returns valid for a normal positive number", () => {
    const result = classifyField("navNgn", "1234567.89", "2026", MF_RULES);
    expect(result.status).toBe("valid");
    expect(result.reason).toBeNull();
    expect(result.value).toBe(1234567.89);
  });

  it("strips commas before parsing", () => {
    const result = classifyField("navNgn", "1,234,567.89", "2026", MF_RULES);
    expect(result.status).toBe("valid");
    expect(result.value).toBe(1234567.89);
  });

  it("unitPriceNgn is valid for 2011 format", () => {
    const result = classifyField("unitPriceNgn", "119.65", "2011", MF_RULES);
    expect(result.status).toBe("valid");
    expect(result.value).toBe(119.65);
  });

  it("unitPriceNgn is not-published for 2026 format", () => {
    const result = classifyField("unitPriceNgn", "119.65", "2026", MF_RULES);
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("field_absent_for_format");
  });
});

describe("absentNavAssessment", () => {
  it("returns fund_missing_nav not-published", () => {
    const result = absentNavAssessment();
    expect(result.status).toBe("not-published");
    expect(result.reason).toBe("fund_missing_nav");
    expect(result.raw).toBeNull();
    expect(result.value).toBeNull();
  });
});