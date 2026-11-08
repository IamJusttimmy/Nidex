import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AMOUNT_USAGE_POLICY, buildNtbQualityReport } from "../index";
import { rec } from "./helpers";

describe("amount usage policy", () => {
  it("keeps the unit unconfirmed and allows only labelled single values", () => {
    expect(AMOUNT_USAGE_POLICY).toMatchObject({
      unitStatus: "unconfirmed",
      label: "unit unconfirmed",
      singleValueDisplay: "allowed-with-label",
      historicalCharts: "not-allowed",
      totalsAndSums: "not-allowed",
      comparisonsAcrossRecords: "not-allowed",
    });
  });

  it("marks every observation's amounts as unit-unconfirmed", () => {
    const { observations } = buildNtbQualityReport([rec({ id: 1 }), rec({ id: 2, tenor: "182DAY", maturityDate: "September-02-2026" })]);
    expect(observations.every((o) => o.amountUnit === "unconfirmed")).toBe(true);
  });

  it("is enforced by a scan: only the checker itself reads the amount fields", () => {
    // If this fails, a new file reads amtOffered, totalSubscription or totalSuccessful. Showing ONE value with
    // a visible "unit unconfirmed" label is allowed; charts, totals and cross-record comparisons are not.
    // If the new use is a labelled single value, add the file to ALLOWED below, deliberately.
    const ALLOWED = new Set(["classify.ts", "types.ts", "config.ts"]);
    const root = path.resolve(__dirname, "..", "..", "..", "..", "..", ".."); // project root: __tests__ is six folders below it
    const pattern = /\b(amtOffered|totalSubscription|totalSuccessful)\b/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
          const inChecker = full.includes(path.join("treasury-bills", "quality"));
          if (inChecker && ALLOWED.has(name)) continue;
          if (pattern.test(readFileSync(full, "utf8"))) offenders.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "src"));
    expect(offenders).toEqual([]);
  });
});