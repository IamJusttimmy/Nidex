#!/usr/bin/env node
/**
 * Gap inspection — CBN Money Market endpoint
 * Run: node scripts/inspect-money-market-gaps.mjs
 * Checks for missing ids, duplicate months, and month-sequence gaps.
 */

const URL = "https://www.cbn.gov.ng/api/GetAllMoneyMarketIndicators";

async function main() {
  const res = await fetch(URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Nidex-research/1.0)",
    },
  });

  const records = await res.json();
  console.log(`Total records: ${records.length}\n`);

  // --- 1. ID gap check ---
  const ids = records.map(r => r.id).sort((a, b) => a - b);
  const minId = ids[0];
  const maxId = ids[ids.length - 1];
  const missingIds = [];
  for (let i = minId; i <= maxId; i++) {
    if (!ids.includes(i)) missingIds.push(i);
  }
  console.log(`--- ID range: ${minId} → ${maxId} (${maxId - minId + 1} expected, ${ids.length} present) ---`);
  if (missingIds.length === 0) {
    console.log("  No missing ids.");
  } else {
    console.log(`  Missing ids (${missingIds.length}): ${missingIds.join(", ")}`);
    // Show what period surrounds each gap
    for (const mid of missingIds) {
      const before = records.find(r => r.id === mid - 1);
      const after  = records.find(r => r.id === mid + 1);
      console.log(`    id ${mid}: between "${before?.period ?? "?"}" and "${after?.period ?? "?"}"`);
    }
  }
  console.log();

  // --- 2. Duplicate month check (same tyear + tmonth) ---
  const monthKey = r => `${r.tyear}-${String(r.tmonth).padStart(2, "0")}`;
  const monthCounts = {};
  for (const r of records) {
    const k = monthKey(r);
    monthCounts[k] = (monthCounts[k] ?? 0) + 1;
  }
  const dupMonths = Object.entries(monthCounts).filter(([, c]) => c > 1);
  console.log("--- Duplicate months (same year + month) ---");
  if (dupMonths.length === 0) {
    console.log("  None.");
  } else {
    for (const [k, c] of dupMonths) console.log(`  ${k}: ${c} records`);
  }
  console.log();

  // --- 3. Month sequence gap check ---
  // Build the full expected sequence from earliest to latest
  const sorted = [...records].sort((a, b) =>
    a.tyear !== b.tyear ? a.tyear - b.tyear : a.tmonth - b.tmonth
  );
  const first = sorted[0];
  const last  = sorted[sorted.length - 1];
  const present = new Set(sorted.map(monthKey));

  const missing = [];
  let y = first.tyear, m = first.tmonth;
  while (y < last.tyear || (y === last.tyear && m <= last.tmonth)) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (!present.has(k)) missing.push(k);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  console.log(`--- Month sequence: ${monthKey(first)} → ${monthKey(last)} ---`);
  if (missing.length === 0) {
    console.log("  No gaps. Every month is present.");
  } else {
    console.log(`  Missing months (${missing.length}):`);
    for (const k of missing) console.log(`    ${k}`);
  }
  console.log();

  // --- 4. Empty-string audit per field ---
  const rateFields = [
    "interBankCallRate", "mrr", "mpr", "treasuryBill",
    "savingsDeposit", "oneMonthDeposit", "threeMonthsDeposit",
    "sixMonthsDeposit", "twelveMonthsDeposit", "primeLending", "maxLending",
  ];
  console.log("--- Empty-string counts per rate field ---");
  for (const f of rateFields) {
    const empty = records.filter(r => r[f] === "" || r[f] === "0.00").length;
    const justEmpty = records.filter(r => r[f] === "").length;
    const justZero  = records.filter(r => r[f] === "0.00").length;
    console.log(`  ${f.padEnd(22)}: ${String(justEmpty).padStart(3)} empty  |  ${String(justZero).padStart(3)} "0.00"  |  ${String(empty).padStart(3)} total blank/zero`);
  }
  console.log();

  // --- 5. MPR / MRR transition ---
  console.log("--- MPR / MRR era transition ---");
  const withMrr = sorted.filter(r => r.mrr !== "" && r.mrr !== "0.00");
  const withMpr = sorted.filter(r => r.mpr !== "" && r.mpr !== "0.00");
  if (withMrr.length) {
    console.log(`  MRR populated: ${monthKey(withMrr[0])} → ${monthKey(withMrr[withMrr.length - 1])} (${withMrr.length} records)`);
  }
  if (withMpr.length) {
    console.log(`  MPR populated: ${monthKey(withMpr[0])} → ${monthKey(withMpr[withMpr.length - 1])} (${withMpr.length} records)`);
  }
  const overlap = sorted.filter(r =>
    r.mrr !== "" && r.mrr !== "0.00" &&
    r.mpr !== "" && r.mpr !== "0.00"
  );
  if (overlap.length) {
    console.log(`  Overlap (both set): ${overlap.map(r => r.period).join(", ")}`);
  } else {
    console.log("  No overlap — MRR and MPR eras are mutually exclusive.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});