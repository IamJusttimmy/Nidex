import type { MfRawFundRow } from "./types";

/**
 * Parse a 2026-format SEC NAV workbook.
 *
 * Sheet: "Weekly Valuation"
 * Row 0:  Title with valuation date (e.g. "Net Asset Value and Unit Price as at 23rd October 2026")
 * Row 1:  Two-period sub-headers (previous week | current week)
 * Row 2:  Column headers
 * Row 3:  Blank
 * Row 4+: Category headings (merged cell, text only), Sub-Total rows, fund rows, Grand Total, NFEM footer
 *
 * We extract the CURRENT WEEK columns (right-hand period) only.
 * Current-week NAV(₦) is at a fixed column offset; we detect it from row 2 headers.
 */

// Column indices in row 2 for the current-week period
// Layout (0-indexed): S/N=0, FUND=1, FUND MANAGER=2
// Previous period: cols 3-13 (NAV$, NAV₦, %Total, BidP$, BidP₦, OfferP$, OfferP₦, Unitholders, YieldWTD, YieldYTD)
// % Change: cols 13-15 (3 columns)
// Current period: cols 16-26 (same 11 columns)
// We'll detect these dynamically from row 2 to be safe.

type SheetRow = (string | number | null | undefined)[];

export interface ParseResult {
  reportingDate: string;        // YYYY-MM-DD
  rows: MfRawFundRow[];
  warnings: string[];
}

/** Convert a numeric Excel serial date to YYYY-MM-DD. */
function excelSerialToDate(serial: number): string {
  // Excel epoch is 1899-12-30
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Parse ordinal date string like "23rd October 2026" → "2026-10-23" */
function parseOrdinalDate(text: string): string | null {
  const months: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const m = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = months[m[2].toLowerCase()];
  const year = m[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

function cellStr(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "number") return String(val);
  return String(val).trim();
}

function isSkipRow(row: SheetRow): boolean {
  const first = cellStr(row[0]).toLowerCase();
  const second = cellStr(row[1]).toLowerCase();
  // Sub-Total, Grand Total, blank, NFEM footer, category heading (no S/N number)
  if (first === "" && second === "") return true;
  if (second.includes("sub-total") || second.includes("grand total")) return true;
  if (second.toLowerCase().startsWith("nfem")) return true;
  // Category headings: col 0 is empty or non-numeric, col 1 is all-caps text
  if (first === "" && second === second.toUpperCase() && second.length > 3) return true;
  return false;
}

function isFundRow(row: SheetRow): boolean {
  if (isSkipRow(row)) return false;
  // S/N must be a positive integer
  const sn = Number(cellStr(row[0]));
  return Number.isInteger(sn) && sn > 0;
}

/**
 * Find the column indices of the current-week period by scanning row 2.
 * Returns { navUsd, navNgn, offerPriceUsd, offerPriceNgn, bidPriceUsd, bidPriceNgn, unitholders, yieldWtd, yieldYtd }
 * We want the SECOND occurrence of NAV($) / NAV(N) etc.
 */
function detectCurrentPeriodCols(headerRow: SheetRow): {
  navUsd: number; navNgn: number;
  offerPriceUsd: number; offerPriceNgn: number;
  bidPriceUsd: number; bidPriceNgn: number;
  unitholders: number; yieldWtd: number; yieldYtd: number;
} | null {
  const headers = headerRow.map((v) => cellStr(v).toLowerCase());

  // Collect all indices for each header label
  const allNavUsd: number[] = [];
  const allNavNgn: number[] = [];
  const allOfferUsd: number[] = [];
  const allOfferNgn: number[] = [];
  const allBidUsd: number[] = [];
  const allBidNgn: number[] = [];
  const allUnitholders: number[] = [];
  const allYieldWtd: number[] = [];
  const allYieldYtd: number[] = [];

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.includes("nav") && h.includes("$")) allNavUsd.push(i);
    else if (h.includes("nav") && (h.includes("n") || h.includes("₦"))) allNavNgn.push(i);
    else if (h.includes("offer") && h.includes("$")) allOfferUsd.push(i);
    else if (h.includes("offer") && (h.includes("n") || h.includes("₦"))) allOfferNgn.push(i);
    else if (h.includes("bid") && h.includes("$")) allBidUsd.push(i);
    else if (h.includes("bid") && (h.includes("n") || h.includes("₦"))) allBidNgn.push(i);
    else if (h.includes("unitholder")) allUnitholders.push(i);
    else if (h.includes("yield") && h.includes("wtd")) allYieldWtd.push(i);
    else if (h.includes("yield") && h.includes("ytd")) allYieldYtd.push(i);
  }

  // Current period = second occurrence of each
  if (
    allNavUsd.length < 2 || allNavNgn.length < 2 ||
    allOfferUsd.length < 2 || allOfferNgn.length < 2 ||
    allBidUsd.length < 2 || allBidNgn.length < 2 ||
    allUnitholders.length < 2 || allYieldWtd.length < 2 || allYieldYtd.length < 2
  ) {
    return null;
  }

  return {
    navUsd:       allNavUsd[1],
    navNgn:       allNavNgn[1],
    offerPriceUsd: allOfferUsd[1],
    offerPriceNgn: allOfferNgn[1],
    bidPriceUsd:  allBidUsd[1],
    bidPriceNgn:  allBidNgn[1],
    unitholders:  allUnitholders[1],
    yieldWtd:     allYieldWtd[1],
    yieldYtd:     allYieldYtd[1],
  };
}

/**
 * Walk upward from a fund row to find the most recent category heading.
 * Category rows have an empty S/N and an ALL-CAPS label in col 1.
 */
function findCategory(rows: SheetRow[], fundRowIndex: number): string | null {
  for (let i = fundRowIndex - 1; i >= 0; i--) {
    const first = cellStr(rows[i][0]);
    const second = cellStr(rows[i][1]);
    if (
      first === "" &&
      second.length > 3 &&
      second === second.toUpperCase() &&
      !second.toLowerCase().includes("sub-total") &&
      !second.toLowerCase().includes("grand total")
    ) {
      return second.trim();
    }
  }
  return null;
}

export function parse2026(
  sheetRows: SheetRow[],
  sourceFile: string,
): ParseResult {
  const warnings: string[] = [];

  // Extract reporting date from row 0
  const titleText = cellStr(sheetRows[0]?.[0]) || cellStr(sheetRows[0]?.[1]) || "";
  let reportingDate = parseOrdinalDate(titleText);
  if (!reportingDate) {
    // Try scanning all cells in row 0
    const allCells = (sheetRows[0] ?? []).map(cellStr).join(" ");
    reportingDate = parseOrdinalDate(allCells);
  }
  if (!reportingDate) {
    warnings.push(`Could not extract reporting date from title row: "${titleText}"`);
    reportingDate = "0000-00-00";
  }

  // Detect current-period column indices from row 2
  const cols = detectCurrentPeriodCols(sheetRows[2] ?? []);
  if (!cols) {
    warnings.push("Could not detect current-period column layout from header row");
    return { reportingDate, rows: [], warnings };
  }

  const rows: MfRawFundRow[] = [];

  for (let i = 4; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (!isFundRow(row)) continue;

    const fundName = cellStr(row[1]);
    const fundManager = cellStr(row[2]) || null;
    const category = findCategory(sheetRows, i);

    rows.push({
      reportingDate,
      fundName,
      fundManager,
      category,
      rawNavNgn:       cellStr(row[cols.navNgn]) || null,
      rawNavUsd:       cellStr(row[cols.navUsd]) || null,
      rawUnitPriceNgn: null,
      rawOfferPriceNgn: cellStr(row[cols.offerPriceNgn]) || null,
      rawOfferPriceUsd: cellStr(row[cols.offerPriceUsd]) || null,
      rawBidPriceNgn:  cellStr(row[cols.bidPriceNgn]) || null,
      rawBidPriceUsd:  cellStr(row[cols.bidPriceUsd]) || null,
      rawUnitholders:  cellStr(row[cols.unitholders]) || null,
      rawYieldWtd:     cellStr(row[cols.yieldWtd]) || null,
      rawYieldYtd:     cellStr(row[cols.yieldYtd]) || null,
      sourceFile,
      sourceFormat: "2026",
    });
  }

  return { reportingDate, rows, warnings };
}