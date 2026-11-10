#!/usr/bin/env node
/**
 * Blank/zero detail — CBN Money Market endpoint
 * Run: node scripts/inspect-money-market-blanks.mjs
 * Lists every period where interBankCallRate or treasuryBill is empty or "0.00".
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

  const period = r => `${r.tyear}-${String(r.tmonth).padStart(2, "0")}`;
  const sorted = [...records].sort((a, b) =>
    a.tyear !== b.tyear ? a.tyear - b.tyear : a.tmonth - b.tmonth
  );

  // --- interBankCallRate ---
  console.log("--- interBankCallRate: empty string ---");
  const ibEmpty = sorted.filter(r => r.interBankCallRate === "");
  if (ibEmpty.length === 0) console.log("  None.");
  for (const r of ibEmpty) console.log(`  ${period(r)}  (${r.period})  id=${r.id}`);

  console.log();
  console.log('--- interBankCallRate: "0.00" ---');
  const ibZero = sorted.filter(r => r.interBankCallRate === "0.00");
  if (ibZero.length === 0) console.log("  None.");
  for (const r of ibZero) console.log(`  ${period(r)}  (${r.period})  id=${r.id}`);

  // --- treasuryBill ---
  console.log();
  console.log('--- treasuryBill: "0.00" ---');
  const tbZero = sorted.filter(r => r.treasuryBill === "0.00");
  if (tbZero.length === 0) console.log("  None.");
  for (const r of tbZero) {
    console.log(`  ${period(r)}  (${r.period})  id=${r.id}`);
    console.log(`    mpr=${r.mpr}  interBankCallRate=${r.interBankCallRate}  primeLending=${r.primeLending}`);
  }

  console.log();
  console.log('--- treasuryBill: empty string ---');
  const tbEmpty = sorted.filter(r => r.treasuryBill === "");
  if (tbEmpty.length === 0) console.log("  None.");
  for (const r of tbEmpty) console.log(`  ${period(r)}  (${r.period})  id=${r.id}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});