import type { MfRawFundRow } from "./types";
import type { ParseResult } from "./parse-2026";

/**
 * Parse a 2011-format SEC NAV workbook.
 *
 * Sheet: Sheet1 (index 0)
 * Row 3:  Title "WEEKLY NET ASSET VALUE AND UNIT PRICE"
 * Row 4:  Headers — S/N, NAME OF FUND, NAV AS AT <date>, UNIT PRICE AS AT <date>
 * Row 7:  Currency row (N, N, ...)
 * Row 8+: Fund rows
 * Last data row: TOTAL row (text "TOTAL" in col 0 or col 1)
 * Footer: "SOURCE: FUND MANAGERS"
 *
 * Only two data columns: NAV (₦), Unit Price (₦). No USD, no categories, no yield.
 */

type SheetRow = (string | number | null | undefined)[];

function cellStr(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/** Parse "DECEMBER 16TH 2011" or "AS AT DECEMBER 16TH 2011" → "2011-12-16" */
function parseHeaderDate(text: string): string | null {
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:ST|ND|RD|TH)?\s+(\d{4})/i);
  if (!m) return null;
  const month = months[m[1].toLowerCase()];
  const day = m[2].padStart(2, "0");
  const year = m[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function isFundRow(row: SheetRow): boolean {
  const sn = Number(cellStr(row[0]));
  return Number.isInteger(sn) && sn > 0;
}

export function parse2011(
  sheetRows: SheetRow[],
  sourceFile: string,
): ParseResult {
  const warnings: string[] = [];

  // Extract reporting date from row 4 (header row contains "AS AT <date>")
  const headerText = sheetRows[4]
    ? sheetRows[4].map(cellStr).join(" ")
    : "";
  let reportingDate = parseHeaderDate(headerText);
  if (!reportingDate) {
    // Fall back to row 3 title
    const titleText = sheetRows[3] ? sheetRows[3].map(cellStr).join(" ") : "";
    reportingDate = parseHeaderDate(titleText);
  }
  if (!reportingDate) {
    warnings.push(`Could not extract reporting date from header: "${headerText}"`);
    reportingDate = "0000-00-00";
  }

  const rows: MfRawFundRow[] = [];

  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!isFundRow(row)) continue;

    const fundName = cellStr(row[1]);
    if (!fundName) continue;

    // NAV is col 2, Unit Price is col 3
    // A fund may have S/N but missing NAV (like fund 39 in 2011)
    const rawNavNgn = cellStr(row[2]) || null;
    const rawUnitPriceNgn = cellStr(row[3]) || null;

    rows.push({
      reportingDate,
      fundName,
      fundManager: null,
      category: null,
      rawNavNgn,
      rawNavUsd: null,
      rawUnitPriceNgn,
      rawOfferPriceNgn: null,
      rawOfferPriceUsd: null,
      rawBidPriceNgn: null,
      rawBidPriceUsd: null,
      rawUnitholders: null,
      rawYieldWtd: null,
      rawYieldYtd: null,
      sourceFile,
      sourceFormat: "2011",
    });
  }

  return { reportingDate, rows, warnings };
}