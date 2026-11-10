#!/usr/bin/env node
/**
 * Inspection script — CBN Money Market endpoint
 * Run: node scripts/inspect-money-market.mjs
 * Prints a structured summary of the raw response to stdout.
 */

const URL = "https://www.cbn.gov.ng/api/GetAllMoneyMarketIndicators";

async function main() {
  console.log(`Fetching: ${URL}\n`);

  const res = await fetch(URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Nidex-research/1.0)",
    },
  });

  console.log(`HTTP status : ${res.status} ${res.statusText}`);
  console.log(`Content-Type: ${res.headers.get("content-type")}`);

  const text = await res.text();
  console.log(`Body size   : ${text.length} characters\n`);

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("Could not parse response as JSON.");
    console.error(e.message);
    console.log("\n--- Raw body (first 2000 chars) ---");
    console.log(text.slice(0, 2000));
    process.exit(1);
  }

  // Top-level shape
  console.log("--- Top-level type ---");
  console.log(Array.isArray(data) ? `Array with ${data.length} items` : `Object with keys: ${Object.keys(data).join(", ")}`);
  console.log();

  // If it's an object, check for a nested array
  let records = data;
  if (!Array.isArray(data)) {
    for (const [key, val] of Object.entries(data)) {
      if (Array.isArray(val)) {
        console.log(`Found array under key "${key}" with ${val.length} items`);
        records = val;
        break;
      }
    }
  }

  if (!Array.isArray(records) || records.length === 0) {
    console.log("No record array found. Full response:");
    console.log(JSON.stringify(data, null, 2).slice(0, 3000));
    process.exit(0);
  }

  // Field inventory
  const allKeys = new Set();
  for (const r of records) Object.keys(r).forEach(k => allKeys.add(k));
  console.log("--- Fields (all keys seen across records) ---");
  for (const key of allKeys) {
    const values = records.map(r => r[key]);
    const types = [...new Set(values.map(v => v === null ? "null" : typeof v))];
    const nullCount = values.filter(v => v === null).length;
    const sample = values.find(v => v !== null);
    console.log(`  ${key}`);
    console.log(`    types   : ${types.join(", ")}`);
    console.log(`    nulls   : ${nullCount} / ${records.length}`);
    console.log(`    sample  : ${JSON.stringify(sample)}`);
  }
  console.log();

  // Date coverage
  // Try to find a date-like field
  const dateCandidates = [...allKeys].filter(k =>
    k.toLowerCase().includes("date") || k.toLowerCase().includes("period") || k.toLowerCase().includes("month")
  );
  console.log("--- Date-like fields ---");
  if (dateCandidates.length === 0) {
    console.log("  None found by name. Check field list above.");
  }
  for (const key of dateCandidates) {
    const vals = records.map(r => r[key]).filter(v => v !== null);
    const sorted = [...vals].sort();
    console.log(`  ${key}: ${vals.length} non-null | earliest: ${sorted[0]} | latest: ${sorted[sorted.length - 1]}`);
  }
  console.log();

  // Duplicate detection on date candidates
  if (dateCandidates.length > 0) {
    const key = dateCandidates[0];
    const counts = {};
    for (const r of records) {
      const v = r[key];
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const dups = Object.entries(counts).filter(([, c]) => c > 1);
    console.log(`--- Duplicates on "${key}" ---`);
    if (dups.length === 0) {
      console.log("  None.");
    } else {
      for (const [val, count] of dups) console.log(`  ${val}: ${count} records`);
    }
    console.log();
  }

  // First 3 and last 3 records
  console.log("--- First 3 records ---");
  console.log(JSON.stringify(records.slice(0, 3), null, 2));
  console.log();
  console.log("--- Last 3 records ---");
  console.log(JSON.stringify(records.slice(-3), null, 2));
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});