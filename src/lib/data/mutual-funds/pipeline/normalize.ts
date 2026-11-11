import type { MfRawFundRow, MfObservation } from "./types";
import { classifyField, absentNavAssessment } from "../quality/classify";
import { MF_RULES } from "../quality/config";

/** Stable ID: reportingDate + fundName, lowercased, non-alphanumeric → underscore */
function makeId(reportingDate: string, fundName: string): string {
  const slug = fundName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${reportingDate}__${slug}`;
}

export function normalizeRow(row: MfRawFundRow): MfObservation {
  const fmt = row.sourceFormat;

  // navNgn: if the fund row had no NAV cell at all (null AND format provides it),
  // use the special absent assessment
  const navNgnAssessment =
    row.rawNavNgn === null && fmt === "2011" && row.rawUnitPriceNgn === null
      ? absentNavAssessment()
      : classifyField("navNgn", row.rawNavNgn, fmt, MF_RULES);

  return {
    id: makeId(row.reportingDate, row.fundName),
    reportingDate: row.reportingDate,
    fundName: row.fundName,
    fundManager: row.fundManager,
    category: row.category,
    fields: {
      navNgn:        navNgnAssessment,
      navUsd:        classifyField("navUsd",        row.rawNavUsd,        fmt, MF_RULES),
      unitPriceNgn:  classifyField("unitPriceNgn",  row.rawUnitPriceNgn,  fmt, MF_RULES),
      offerPriceNgn: classifyField("offerPriceNgn", row.rawOfferPriceNgn, fmt, MF_RULES),
      offerPriceUsd: classifyField("offerPriceUsd", row.rawOfferPriceUsd, fmt, MF_RULES),
      bidPriceNgn:   classifyField("bidPriceNgn",   row.rawBidPriceNgn,   fmt, MF_RULES),
      bidPriceUsd:   classifyField("bidPriceUsd",   row.rawBidPriceUsd,   fmt, MF_RULES),
      unitholders:   classifyField("unitholders",   row.rawUnitholders,   fmt, MF_RULES),
      yieldWtd:      classifyField("yieldWtd",      row.rawYieldWtd,      fmt, MF_RULES),
      yieldYtd:      classifyField("yieldYtd",      row.rawYieldYtd,      fmt, MF_RULES),
    },
    sourceFile: row.sourceFile,
    sourceFormat: row.sourceFormat,
  };
}