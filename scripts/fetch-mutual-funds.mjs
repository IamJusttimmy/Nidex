/**
 * fetch-mutual-funds.mjs
 *
 * Fetches the latest SEC weekly NAV workbook, parses it, merges with the
 * existing accumulating JSON, and writes public/data/mutual-funds/latest.json.
 *
 * Usage:
 *   node scripts/fetch-mutual-funds.mjs
 *
 * Exit codes:
 *   0 — success (file written or unchanged)
 *   1 — failure (previous file preserved)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";
import { parse2026 } from "../src/lib/data/mutual-funds/pipeline/parse-2026.ts";
import { parse2011 } from "../src/lib/data/mutual-funds/pipeline/parse-2011.ts";
import { normalizeRow } from "../src/lib/data/mutual-funds/pipeline/normalize.ts";
import { mergeObservations, buildDocument } from "../src/lib/data/mutual-funds/pipeline/build.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "../public/data/mutual-funds/latest.json");
const ARCHIVE_ROOT = "https://sec.gov.ng/for-operators/keep-track-of-capital-market-data/net-asset-value-data/weekly-net-asset-value-for-cis/";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchText(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchBuffer(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ── SEC page scraping ─────────────────────────────────────────────────────────

/**
 * Extract all href values matching *.xlsx or *.XLSX or *.xls from raw HTML.
 */
function extractFileLinks(html, baseUrl) {
  const links = [];
  const re = /href=["']([^"']+\.xlsx?)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1];
    if (!href.startsWith("http")) {
      const base = new URL(baseUrl);
      href = href.startsWith("/")
        ? `${base.protocol}//${base.host}${href}`
        : `${baseUrl.replace(/\/?$/, "/")}${href}`;
    }
    links.push(href);
  }
  return links;
}

/**
 * Parse ordinal date from SEC filename:
 * "Net_Asset_Value_and_Unit_Price_as_at_23rd_October_2026.XLSX" → "2026-10-23"
 */
function parseDateFromFilename(filename) {
  const months = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const m = filename.match(/(\d{1,2})(?:st|nd|rd|th)?[_\s]+([A-Za-z]+)[_\s]+(\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = months[m[2].toLowerCase()];
  const year = m[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Find the year page URL for the current year (falling back to previous year).
 */
async function findYearPageUrl(archiveHtml) {
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear - 1]) {
    const re = new RegExp(`href=["']([^"']*${year}[^"']*weekly[^"']*)["']`, "i");
    const m = re.exec(archiveHtml);
    if (m) return m[1].startsWith("http") ? m[1] : `https://sec.gov.ng${m[1]}`;
  }
  throw new Error("Could not find year page URL in archive HTML");
}

/**
 * Find the latest Excel file link on a year page.
 * Returns { url, filename, reportingDate }.
 */
async function findLatestFileLink(yearPageUrl) {
  console.log(`  Fetching year page: ${yearPageUrl}`);
  const html = await fetchText(yearPageUrl);
  const links = extractFileLinks(html, yearPageUrl);
  if (links.length === 0) throw new Error("No Excel links found on year page");

  // Parse dates from filenames and pick the latest
  const dated = links
    .map((url) => {
      const filename = decodeURIComponent(url.split("/").pop() ?? "");
      const reportingDate = parseDateFromFilename(filename);
      return { url, filename, reportingDate };
    })
    .filter((x) => x.reportingDate !== null);

  if (dated.length === 0) throw new Error("Could not parse dates from any filename");

  dated.sort((a, b) => b.reportingDate.localeCompare(a.reportingDate));
  return dated[0];
}

// ── Excel parsing (dynamic import of xlsx) ───────────────────────────────────

async function parseWorkbook(buffer, filename) {
  // Dynamically import xlsx (SheetJS) — must be installed as a dep
  const XLSX = (await import("xlsx")).default;

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // Determine format by sheet names
  const sheetNames = workbook.SheetNames;
  const is2026 = sheetNames.some((s) => s.toLowerCase().includes("weekly valuation"));
  const sheetName = is2026
    ? sheetNames.find((s) => s.toLowerCase().includes("weekly valuation"))
    : sheetNames[0];

  if (!sheetName) throw new Error(`No usable sheet found in ${filename}`);

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (is2026) {
    return parse2026(rows, filename);
  } else {
    return parse2011(rows, filename);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== fetch-mutual-funds ===");

  // 1. Scrape archive root → find year page → find latest file
  console.log("Fetching archive page...");
  const archiveHtml = await fetchText(ARCHIVE_ROOT);
  const yearPageUrl = await findYearPageUrl(archiveHtml);
  const latest = await findLatestFileLink(yearPageUrl);

  console.log(`Latest file: ${latest.filename}`);
  console.log(`Reporting date: ${latest.reportingDate}`);

  // 2. Check if this date is already in the existing JSON
  let existingObservations = [];
  if (fs.existsSync(OUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
      existingObservations = existing.observations ?? [];
      const existingDates = new Set(existingObservations.map((o) => o.reportingDate));
      if (existingDates.has(latest.reportingDate)) {
        // Date already present — but still re-fetch in case the file was corrected.
        // The merge will replace the existing week's records.
        console.log(`Week ${latest.reportingDate} already in file — checking for corrections...`);
      }
    } catch (e) {
      console.warn("Could not read existing JSON, starting fresh:", e.message);
    }
  }

  // 3. Download the workbook
  console.log(`Downloading ${latest.url}...`);
  const buffer = await fetchBuffer(latest.url);
  console.log(`Downloaded ${buffer.length} bytes`);

  // 4. Parse
  console.log("Parsing workbook...");
  const parseResult = await parseWorkbook(buffer, latest.filename);
  if (parseResult.warnings.length > 0) {
    console.warn("Parse warnings:");
    parseResult.warnings.forEach((w) => console.warn("  !", w));
  }
  console.log(`Parsed ${parseResult.rows.length} fund rows for ${parseResult.reportingDate}`);

  if (parseResult.rows.length === 0) {
    console.error("No fund rows parsed — aborting");
    process.exit(1);
  }

  // 5. Normalize
  const newObservations = parseResult.rows.map(normalizeRow);

  // 6. Merge with existing
  const merged = mergeObservations(existingObservations, newObservations);
  console.log(`Total observations after merge: ${merged.length}`);

  // 7. Build document
  const retrievedAt = new Date().toISOString();
  const doc = buildDocument(merged, retrievedAt);

  console.log(`Quality: ${doc.quality.total} observations across ${doc.quality.weekCount} weeks, ${doc.quality.fundCount} funds`);
  console.log(`Last reporting date: ${doc.quality.lastReportingDate}`);
  console.log(`Status breakdown:`, doc.quality.byStatus);

  // 8. Write output
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const json = JSON.stringify(doc, null, 2);

  // Check if content changed (ignoring retrievedAt)
  if (fs.existsSync(OUT_PATH)) {
    const existingRaw = fs.readFileSync(OUT_PATH, "utf-8");
    const existingDoc = JSON.parse(existingRaw);
    const existingNorm = JSON.stringify({ ...existingDoc, retrievedAt: "" });
    const newNorm = JSON.stringify({ ...doc, retrievedAt: "" });
    if (existingNorm === newNorm) {
      console.log("Content unchanged — skipping write");
      process.exit(0);
    }
  }

  fs.writeFileSync(OUT_PATH, json, "utf-8");
  console.log(`Written: ${OUT_PATH}`);
  console.log(`Done. Latest period: ${doc.quality.lastReportingDate}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});