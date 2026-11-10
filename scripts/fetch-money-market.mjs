#!/usr/bin/env node
/**
 * Fetch, validate, and publish the CBN Money Market dataset.
 *
 * Usage:
 *   node scripts/fetch-money-market.mjs
 *
 * Environment variables:
 *   MM_MIN_RECORDS   Minimum acceptable record count (default: 200)
 *   MM_MAX_DROP      Maximum allowed drop from previous count (default: 5)
 *
 * Exit codes:
 *   0  Success (file written or unchanged)
 *   1  Fetch or validation failure (previous file preserved)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "..");
const OUT_PATH  = resolve(ROOT, "public/data/money-market/latest.json");
const ENDPOINT  = "https://www.cbn.gov.ng/api/GetAllMoneyMarketIndicators";

const MIN_RECORDS = Number(process.env.MM_MIN_RECORDS ?? 200);
const MAX_DROP    = Number(process.env.MM_MAX_DROP    ?? 5);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg)  { process.stdout.write(`[fetch-money-market] ${msg}\n`); }
function fail(msg) { process.stderr.write(`[fetch-money-market] FAIL: ${msg}\n`); process.exit(1); }

function periodFromRecord(r) {
  return `${r.tyear}-${String(r.tmonth).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Quality rules (must stay in sync with src/lib/data/money-market/quality/)
// ---------------------------------------------------------------------------

const RULES = {
  version:                    "2026-11-10.1",
  mprStartPeriod:             "2006-12",
  interbankTrailingEmptyFrom: "2026-03",
};

const RULE_DESCRIPTIONS = {
  mpr_pre_era_zero:         "MPR is '0.00' before December 2006, the month CBN introduced it.",
  mrr_post_era_empty:       "MRR is empty from December 2006 onward; MRR was replaced by MPR.",
  interbank_trailing_empty: "Interbank call rate is empty from March 2026 onward; CBN stopped publishing it.",
  rate_zero_suspicious:     "Rate is '0.00' in a period where zero is implausible.",
  rate_empty_unexpected:    "Rate is an empty string outside any known non-publishing era.",
  rate_unparseable:         "Rate is a non-numeric string that cannot be parsed.",
};

const RATE_FIELDS = [
  "mpr", "mrr", "interBankCallRate", "treasuryBill",
  "savingsDeposit", "oneMonthDeposit", "threeMonthsDeposit",
  "sixMonthsDeposit", "twelveMonthsDeposit", "primeLending", "maxLending",
];

function classifyRate(field, raw, period) {
  if (field === "mpr" && raw === "0.00" && period < RULES.mprStartPeriod)
    return { raw, value: null, status: "not-published", reason: "mpr_pre_era_zero" };

  if (field === "mrr" && raw === "" && period >= RULES.mprStartPeriod)
    return { raw, value: null, status: "not-published", reason: "mrr_post_era_empty" };

  if (field === "interBankCallRate" && raw === "" && period >= RULES.interbankTrailingEmptyFrom)
    return { raw, value: null, status: "not-published", reason: "interbank_trailing_empty" };

  if (raw === "")
    return { raw, value: null, status: "not-published", reason: "rate_empty_unexpected" };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed))
    return { raw, value: null, status: "invalid", reason: "rate_unparseable" };

  if (parsed === 0)
    return { raw, value: 0, status: "suspicious", reason: "rate_zero_suspicious" };

  return { raw, value: parsed, status: "valid", reason: null };
}

function normalizeRecord(src) {
  const period = periodFromRecord(src);
  const rates = {};
  for (const field of RATE_FIELDS) {
    rates[field] = classifyRate(field, src[field], period);
  }
  return { id: src.id, period, periodLabel: src.period, rates };
}

function buildQuality(observations) {
  const fired = new Map();
  let fullyValid = 0, withSuspicious = 0, withInvalid = 0;

  for (const obs of observations) {
    let hasSuspicious = false, hasInvalid = false;
    for (const field of RATE_FIELDS) {
      const a = obs.rates[field];
      if (a.status === "suspicious") hasSuspicious = true;
      if (a.status === "invalid")    hasInvalid    = true;
      if (a.reason !== null) {
        const key = `${a.reason}:${field}`;
        const entry = fired.get(key);
        if (entry) entry.periods.push(obs.period);
        else fired.set(key, { status: a.status, periods: [obs.period] });
      }
    }
    if (hasInvalid)         withInvalid++;
    else if (hasSuspicious) withSuspicious++;
    else                    fullyValid++;
  }

  const rulesFired = [];
  for (const [key, { status, periods }] of fired) {
    const [rule, field] = key.split(":");
    const sorted = [...periods].sort();
    const entry = {
      rule,
      description: RULE_DESCRIPTIONS[rule] ?? rule,
      status, field,
      count: sorted.length,
    };
    if (sorted.length <= 20) entry.periods = sorted;
    else { entry.firstPeriod = sorted[0]; entry.lastPeriod = sorted[sorted.length - 1]; }
    rulesFired.push(entry);
  }

  rulesFired.sort((a, b) => b.count - a.count);
  return { totalObservations: observations.length, fullyValid, withSuspicious, withInvalid, rulesFired };
}

function buildDocument(sourceRecords, retrievedAt) {
  const observations = sourceRecords
    .map(normalizeRecord)
    .sort((a, b) => a.period.localeCompare(b.period));
  const quality = buildQuality(observations);
  const periods = observations.map(o => o.period);
  return {
    source: {
      publisher:    "Central Bank of Nigeria",
      endpoint:     ENDPOINT,
      retrievedAt,
      rulesVersion: RULES.version,
    },
    coverage: {
      firstPeriod:  periods[0]  ?? "",
      lastPeriod:   periods[periods.length - 1] ?? "",
      totalRecords: observations.length,
    },
    quality,
    observations,
  };
}

// ---------------------------------------------------------------------------
// Regression checks
// ---------------------------------------------------------------------------

function regressionCheck(next, prevPath) {
  if (!existsSync(prevPath)) {
    log("No previous file found — skipping regression check.");
    return;
  }

  let prev;
  try {
    prev = JSON.parse(readFileSync(prevPath, "utf8"));
  } catch {
    log("Previous file unreadable — skipping regression check.");
    return;
  }

  const prevCount = prev.coverage?.totalRecords ?? 0;
  const nextCount = next.coverage.totalRecords;
  const drop = prevCount - nextCount;

  if (drop > MAX_DROP) {
    fail(
      `Record count dropped from ${prevCount} to ${nextCount} (drop: ${drop}, max allowed: ${MAX_DROP}). ` +
      `Previous file preserved.`
    );
  }

  const prevLast = prev.coverage?.lastPeriod ?? "";
  const nextLast = next.coverage.lastPeriod;
  if (nextLast < prevLast) {
    fail(
      `Latest period regressed from ${prevLast} to ${nextLast}. ` +
      `Previous file preserved.`
    );
  }

  log(`Regression check passed. Records: ${prevCount} → ${nextCount}. Latest: ${prevLast} → ${nextLast}.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  log(`Fetching ${ENDPOINT}`);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Nidex/1.0)",
      },
    });
  } catch (e) {
    fail(`Network error: ${e.message}`);
  }

  if (!res.ok) fail(`HTTP ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("text/")) {
    fail(`Unexpected content-type: ${contentType}`);
  }

  let sourceRecords;
  try {
    const text = await res.text();
    sourceRecords = JSON.parse(text);
  } catch (e) {
    fail(`Response is not valid JSON: ${e.message}`);
  }

  if (!Array.isArray(sourceRecords)) fail("Response is not a JSON array.");
  if (sourceRecords.length < MIN_RECORDS) {
    fail(`Only ${sourceRecords.length} records returned (minimum: ${MIN_RECORDS}). Previous file preserved.`);
  }

  log(`Received ${sourceRecords.length} source records.`);

  const retrievedAt = new Date().toISOString();
  const doc = buildDocument(sourceRecords, retrievedAt);

  regressionCheck(doc, OUT_PATH);

  const next = JSON.stringify(doc, null, 2);

  // Skip write if content is identical (avoids unnecessary git commits)
  if (existsSync(OUT_PATH)) {
    const prev = readFileSync(OUT_PATH, "utf8");
    // Compare without retrievedAt to avoid spurious changes
    const normalize = (s) => s.replace(/"retrievedAt":\s*"[^"]+"/, '"retrievedAt": ""');
    if (normalize(prev) === normalize(next)) {
      log("Dataset unchanged. No file written.");
      process.exit(0);
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, next, "utf8");
  log(`Written: ${OUT_PATH}`);
  log(`Coverage: ${doc.coverage.firstPeriod} → ${doc.coverage.lastPeriod} (${doc.coverage.totalRecords} records)`);
  log(`Quality: ${doc.quality.fullyValid} valid, ${doc.quality.withSuspicious} suspicious, ${doc.quality.withInvalid} invalid`);
}

main().catch(err => {
  fail(err.message ?? String(err));
});