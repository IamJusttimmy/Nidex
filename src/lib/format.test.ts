import { describe, expect, it } from "vitest";
import { formatDate, formatDateTimeUtc, formatPercent, formatRate, formatSigned } from "./format";

describe("formatRate", () => {
  it("uses 2 decimals from 100 up, with thousands separators", () => {
    expect(formatRate(1384.4)).toBe("1,384.40");
    expect(formatRate(100)).toBe("100.00");
  });
  it("uses 4 decimals below 100", () => {
    expect(formatRate(9.1234)).toBe("9.1234");
    expect(formatRate(0.7)).toBe("0.7000");
  });
});

describe("formatDate", () => {
  it("turns an ISO date into day, month and year without shifting it", () => {
    expect(formatDate("2026-11-05")).toBe("5 Nov 2026");
    expect(formatDate("2023-12-22")).toBe("22 Dec 2023");
  });
  it("returns text it cannot read unchanged", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("formatDateTimeUtc", () => {
  it("shows the UTC time", () => {
    expect(formatDateTimeUtc("2026-11-06T20:22:10.482Z")).toBe("6 Nov 2026, 20:22 UTC");
  });
});

describe("formatSigned and formatPercent", () => {
  it("puts a sign on changes, using a real minus", () => {
    expect(formatSigned(1.2)).toBe("+1.2000");
    expect(formatSigned(1523.5)).toBe("+1,523.50");
    expect(formatSigned(-0.5)).toBe("−0.5000");
    expect(formatSigned(-12.345)).toBe("−12.3450");
    expect(formatSigned(0)).toBe("0.00");
  });
  it("formats percentages with a sign", () => {
    expect(formatPercent(0.0712)).toBe("+0.07%");
    expect(formatPercent(-1.249)).toBe("−1.25%");
    expect(formatPercent(0)).toBe("0.00%");
  });
});