import { describe, expect, it } from "vitest";
import { parse2026 } from "../parse-2026";

describe("parse2026", () => {
  it("extracts a month-first reporting date from the SEC title", () => {
    const result = parse2026(
      [["WEEKLY VALUATION REPORT OF COLLECTIVE INVESTMENT SCHEMES AS AT WEEK ENDED FRIDAY, OCTOBER 23, 2026"]],
      "weekly-nav.xlsx",
    );

    expect(result.reportingDate).toBe("2026-10-23");
  });
});
