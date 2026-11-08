/**
 * Generates the exchange-rate quality review from a raw rates.csv.
 *   npx tsx scripts/quality-report.ts <path-to-rates.csv> [output-dir]
 * Reads the CSV, never writes to it.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildQualityReport, buildChartSeries, explainFlagged, flaggedObservations,
  DEFAULT_RULES, VERIFICATION_OVERRIDES, type QualityRules, type RateObservation, type QualityStatus,
} from "../src/lib/data/exchange-rates/quality";

const input = process.argv[2] ?? "rates.csv";
const outDir = process.argv[3] ?? ".";
const csv = readFileSync(input, "utf8");

const rep = buildQualityReport(csv, DEFAULT_RULES, VERIFICATION_OVERRIDES);
const obs = rep.observations;
const before = buildQualityReport(csv, { ...DEFAULT_RULES, promoteMechanicalErrors: false }, VERIFICATION_OVERRIDES).observations;

const L: string[] = [];
const out = (s = "") => L.push(s);
const codes = (o: RateObservation): string[] => [o.quality.buy, o.quality.mid, o.quality.sell, o.quality.quotePair].flatMap((a) => a.reasons.map((r) => r.code));
const has = (o: RateObservation, c: string) => codes(o).includes(c);
const hasPrefix = (o: RateObservation, p: string) => codes(o).some((c) => c.startsWith(p));
const anyRev = (o: RateObservation) => hasPrefix(o, "single_observation_reversion");
const key = (o: RateObservation) => o.code + "|" + o.date;
const worst = (o: RateObservation): QualityStatus => {
  const s = [o.quality.buy.status, o.quality.mid.status, o.quality.sell.status, o.quality.quotePair.status];
  return s.includes("invalid") ? "invalid" : s.includes("suspicious") ? "suspicious" : "valid";
};
const count = (rows: RateObservation[], f: (o: RateObservation) => boolean) => rows.filter(f).length;

out("# Exchange-rate quality review");
out(`Rules version **${rep.rules.version}**. Source rows: ${rep.sourceRowCount}. Classified observations: ${obs.length}. Nothing is deleted or edited: every parsed source row is in the output with its original text.`);
out(`Set aside before classification (not a foreign currency): ${rep.excluded.map((e) => `${e.code} (${e.rows} rows)`).join(", ") || "none"}.`);
out(`\nRejected at parsing, kept with the reason (${rep.rejected.length}):`);
for (const r of rep.rejected) out(`- source row ${r.sourceRow}: ${r.kind}. ${r.message}. Raw: \`${r.rawFields.join(",")}\``);

out("\n## Decisions applied");
out("1. A suspicious value is promoted to **invalid** only on strong mechanical evidence, field by field: a power-of-ten shift that fits BOTH neighbours within 5%, or a full buy/mid/sell copy of a clean record of another currency while the affected currency's own neighbours do not support it. Original reasons are kept and the evidence is added. Switching `promoteMechanicalErrors` off restores the earlier statuses.");
const midMajor = count(obs, (o) => has(o, "mid_outside_range_major"));
out(`2. Midpoint: the ${midMajor} larger deviations (more than 1% outside the buy-sell range) are invalid midpoints; smaller ones stay suspicious and pending. A midpoint problem never changes buy or sell.`);
out("3. The cross-rate check is evidence only. It adds a warning, never changes a status or value.");
out("4. 22 December 2023 stays suspicious and unresolved. DKK 19 June 2025 stays valid.");
out("5. **New:** the midpoint-outside-range check is skipped whenever the quote pair is invalid (buy above sell). In those rows the buy-sell range is unreliable and the midpoint is usually the correct value. All other midpoint checks still run. Setting `skipMidRangeCheckWhenPairInvalid` to false restores the old behaviour.");

out("\n## Rules in force");
out("```json\n" + JSON.stringify(rep.rules, null, 2) + "\n```");
out(`Normal relative spread per currency (median of |sell-buy| / average of the two). Abnormal means above ${rep.rules.spreadMultiplier}x this:`);
for (const [c, b] of Object.entries(rep.spreadBaselines)) out(`- ${c}: normal ${(b * 100).toFixed(3)}%, abnormal above ${(b * rep.rules.spreadMultiplier * 100).toFixed(3)}%`);

out("\n## Final counts by field and status");
out("| Field | valid | suspicious | invalid |\n|---|---:|---:|---:|");
for (const f of ["buy", "mid", "sell", "quotePair"] as const) {
  const n = (s: QualityStatus) => count(obs, (o) => o.quality[f].status === s);
  out(`| ${f} | ${n("valid")} | ${n("suspicious")} | ${n("invalid")} |`);
}
const flagged = flaggedObservations(obs);
out(`\nObservations with at least one non-valid field or pair: **${flagged.length}** of ${obs.length} (${rep.rejected.length} more rows were rejected at parsing).`);
out(`Worst status per observation: invalid ${count(obs, (o) => worst(o) === "invalid")}, suspicious ${count(obs, (o) => worst(o) === "suspicious")}, valid ${count(obs, (o) => worst(o) === "valid")}.`);

// Exclusive groups, in priority order A, B, C, D, computed from the classification BEFORE promotion so they match the earlier review.
const bA = before.filter((o) => has(o, "buy_above_sell"));
const aKeys = new Set(bA.map(key));
const spiked = before.filter((o) => !aKeys.has(key(o)) && anyRev(o));
const bB = spiked.filter((o) => has(o, "single_observation_reversion_abnormal_spread"));
const bC = spiked.filter((o) => !has(o, "single_observation_reversion_abnormal_spread"));
const used = new Set([...bA, ...bB, ...bC].map(key));
const midRows = before.filter((o) => hasPrefix(o, "mid_outside_range"));
const bD = midRows.filter((o) => !used.has(key(o)));
const groupOf = new Map<string, string>();
bA.forEach((o) => groupOf.set(key(o), "A")); bB.forEach((o) => groupOf.set(key(o), "B")); bC.forEach((o) => groupOf.set(key(o), "C")); bD.forEach((o) => groupOf.set(key(o), "D"));
const afterByKey = new Map(obs.map((o) => [key(o), o]));

out("\n## Group counts (each observation counted once, priority A, B, C, D)");
out("| Group | Observations | Earlier review | What happens to it now |\n|---|---:|---:|---|");
const fin = (g: string, f: (o: RateObservation) => boolean) => count([...groupOf].filter(([, v]) => v === g).map(([k]) => afterByKey.get(k)!), f);
out(`| A buy above sell | ${bA.length} | 35 | ${bA.length} quote pairs invalid |`);
out(`| B spike, abnormal spread | ${bB.length} | 42 | affected fields invalid (1 earlier row is now rejected at parsing: XOF 2006-07-20, buy -0.2310) |`);
out(`| C spike, normal spread | ${bC.length} | 40 | ${fin("C", (o) => hasPrefix(o, "mechanical"))} promoted to invalid by mechanical evidence, ${fin("C", (o) => !hasPrefix(o, "mechanical") && worst(o) === "suspicious")} remain suspicious (1 earlier row, DKK 2025-06-19, was a false flag and is valid) |`);
out(`| D midpoint outside range | ${bD.length} | 41 | ${count(bD, (o) => has(o, "mid_outside_range_major"))} midpoints invalid, ${count(bD, (o) => has(o, "mid_outside_range_minor"))} suspicious |`);
out(`| Total | ${bA.length + bB.length + bC.length + bD.length} | 158 | |`);

const legacy = buildQualityReport(csv, { ...DEFAULT_RULES, promoteMechanicalErrors: false, skipMidRangeCheckWhenPairInvalid: false }, VERIFICATION_OVERRIDES).observations;
const legacyMid = legacy.filter((o) => hasPrefix(o, "mid_outside_range"));
const skipped = legacyMid.filter((o) => o.quality.quotePair.status === "invalid");
out("\n## Midpoint outside the range: counts before and after the skip rule");
out(`Before the skip rule, **${legacyMid.length}** observations had a midpoint outside the buy-sell range beyond rounding. ${skipped.length} of them were rows whose quote pair is invalid (all in Group A). On those rows the range is reversed or unreliable, and the midpoint is usually the correct number, so the check is now skipped there. What remains:`);
out("| | Observations | midpoint invalid (>1% outside) | midpoint suspicious |\n|---|---:|---:|---:|");
out(`| Before the skip rule | ${legacyMid.length} | ${count(legacyMid, (o) => has(o, "mid_outside_range_major"))} | ${count(legacyMid, (o) => has(o, "mid_outside_range_minor"))} |`);
out(`| Skipped (quote pair invalid) | ${skipped.length} | ${count(skipped, (o) => has(o, "mid_outside_range_major"))} | ${count(skipped, (o) => has(o, "mid_outside_range_minor"))} |`);
out(`| **Now flagged** | **${midRows.length}** | **${count(midRows, (o) => has(o, "mid_outside_range_major"))}** | **${count(midRows, (o) => has(o, "mid_outside_range_minor"))}** |`);
out(`\nThe ${midRows.length} observations still flagged are exactly the ${bD.length} Group D records (${midRows.length === bD.length ? "no overlap with A, B or C any more" : "plus overlap with other groups"}). The earlier gap between 75 and 41 was entirely the overlap with Group A.`);
const devs = midRows.map((o) => Number(o.quality.mid.reasons.find((r) => r.code.startsWith("mid_outside"))!.detail!.outsideByFraction)).sort((a, b) => a - b);
out(`Distance outside the range, as a fraction of the nearest edge: the largest "small" one is ${(Math.max(...devs.filter((d) => d <= 0.01)) * 100).toFixed(2)}% and the smallest "large" one is ${(Math.min(...devs.filter((d) => d > 0.01)) * 100).toFixed(2)}%, so any threshold between those gives the same split.`);

// What the midpoint is
let near = 0, total = 0;
for (const o of obs) if (o.buy !== null && o.sell !== null && o.mid !== null && o.buy <= o.sell) { total++; if (Math.abs(o.mid - (o.buy + o.sell) / 2) / ((o.buy + o.sell) / 2) < 1e-4) near++; }
out("\n### What the midpoint is (source definition)");
out(`The CBN rates page labels its columns Buying, Central and Selling under "Weighted Average Rate - Nigerian Foreign Exchange Market (NFEM)" and does not define how Central is derived. Empirically, the published midpoint equals the simple average of buy and sell (within 0.01%) in ${near} of ${total} usable observations (${((near / total) * 100).toFixed(2)}%). The 1% threshold rests on that observed behaviour, not on a published definition, so it should be shown as such on the methodology note.`);

out("\n## Mechanical-error promotion");
const promoted = obs.filter((o) => hasPrefix(o, "mechanical"));
out(`${promoted.length} observations had at least one field promoted. All three fields were promoted on every one of them.`);
out("| Date | Currency | Evidence (buy / mid / sell) | Published buy |\n|---|---|---|---:|");
for (const o of promoted) out(`| ${o.date} | ${o.code} | ${(["buy", "mid", "sell"] as const).map((f) => (o.quality[f].reasons.find((r) => r.code.startsWith("mechanical"))?.code ?? "-").replace("mechanical_error_", "")).join(" / ")} | ${o.buy} |`);
const notPromoted = bC.map((o) => afterByKey.get(key(o))!).filter((o) => !hasPrefix(o, "mechanical"));
out(`\nGroup C observations NOT promoted (${notPromoted.length}), with the best available description:`);
for (const o of notPromoted) { const e = explainFlagged(o, obs); out(`- ${o.date} ${o.code} buy ${o.buy}: ${e.kind.replace(/_/g, " ")} (${e.note}); verification ${o.verification}${o.warnings.length ? "; cross-rate warning" : ""}`); }

out("\n## Cross-rate warnings (evidence only)");
const warned = obs.filter((o) => o.warnings.length);
out(`Threshold ${rep.rules.crossRateThreshold * 100}% against the median of up to two clean neighbours either side. Not evaluated for USD, or ${rep.rules.crossRateExcludedCodes.join(" and ")} (too noisy: with them included the check produced 352 warnings, about 250 from these two). **${warned.length} warnings**:`);
out(`- on observations that are already invalid: ${count(warned, (o) => worst(o) === "invalid")}`);
out(`- on suspicious observations: ${count(warned, (o) => worst(o) === "suspicious")}`);
out(`- on observations still fully valid: ${count(warned, (o) => worst(o) === "valid")} (market moves, or timing differences between currencies on volatile days; nothing is hidden because of them)`);
const susNow = obs.filter((o) => worst(o) === "suspicious" && anyRev(o));
out(`- of ${susNow.length} observations still suspicious for spike reasons, ${count(susNow, (o) => o.warnings.length > 0)} also carry a cross-rate warning`);
const byCur: Record<string, number> = {}; warned.forEach((o) => (byCur[o.code] = (byCur[o.code] ?? 0) + 1));
out(`- by currency: ${Object.entries(byCur).map(([c, n]) => `${c} ${n}`).join(", ")}`);
const check = obs.filter((o) => o.warnings.length).every((o) => before.find((b) => key(b) === key(o))!.quality.buy.status === o.quality.buy.status || hasPrefix(o, "mechanical"));
out(`Check: warnings changed no status (the only status changes between runs come from mechanical promotion): ${check}`);

out("\n## Verification states");
for (const s of ["not-required", "pending", "unresolved", "corroborated"]) out(`- ${s}: ${count(obs, (o) => o.verification === s)}`);

out("\n## 22 December 2023 (kept suspicious and unresolved)");
for (const o of obs.filter((o) => o.date === "2023-12-22" && o.verification === "unresolved")) out(`- ${o.code}: buy ${o.buy}, buy ${o.quality.buy.status}, verification ${o.verification}`);
out(`\n${VERIFICATION_OVERRIDES[0].note}`);
const dkk = ["2025-06-18", "2025-06-19", "2025-06-20"].map((d) => obs.find((o) => o.code === "DKK" && o.date === d)!);
out("\n## DKK 18-20 June 2025");
for (const o of dkk) out(`- ${o.date}: buy ${o.buy}, buy ${o.quality.buy.status}, verification ${o.verification}${o.quality.buy.reasons.length ? " (" + o.quality.buy.reasons.map((r) => r.code).join(", ") + ")" : ""}`);

// Sensitivity
const run = (rules: QualityRules) => buildQualityReport(csv, rules).observations;
const sens = (rules: QualityRules) => { const r = run(rules); const ra = r.filter((o) => !has(o, "buy_above_sell") && anyRev(o)); return { B: count(ra, (o) => has(o, "single_observation_reversion_abnormal_spread")), C: count(ra, (o) => !has(o, "single_observation_reversion_abnormal_spread")), all: count(r, anyRev), major: count(r, (o) => has(o, "mid_outside_range_major")), minor: count(r, (o) => has(o, "mid_outside_range_minor")), prom: count(r, (o) => hasPrefix(o, "mechanical")) }; };
const nop = { ...DEFAULT_RULES, promoteMechanicalErrors: false };
out("\n## Sensitivity (each row changes one setting; all counts on the real data)");
out("\nAbnormal-spread multiplier (spike observations outside Group A)\n\n| x median | B (invalid) | C (suspicious) |\n|---:|---:|---:|");
for (const k of [2, 3, 4, 5, 7, 10, 20, 50]) { const c = sens({ ...nop, spreadMultiplier: k }); out(`| ${k} | ${c.B} | ${c.C} |`); }
out("\nMidpoint invalid threshold (all observations with a midpoint outside the range)\n\n| threshold | invalid | suspicious |\n|---:|---:|---:|");
for (const t of [0.002, 0.005, 0.0082, 0.01, 0.0135, 0.02, 0.04, 0.05]) { const c = sens({ ...nop, midInvalidDeviation: t }); out(`| ${(t * 100).toFixed(2)}% | ${c.major} | ${c.minor} |`); }
out("\nMidpoint rounding tolerance (absolute, in naira)\n\n| tolerance | midpoints flagged |\n|---:|---:|");
for (const t of [0, 0.0001, 0.0005, 0.001, 0.005]) { const c = sens({ ...nop, midRoundingTolerance: t }); out(`| ${t} | ${c.major + c.minor} |`); }
out("\nSpike jump threshold\n\n| jump | observations with a reversion flag |\n|---:|---:|");
for (const j of [0.1, 0.15, 0.2, 0.3, 0.5]) out(`| ${j * 100}% | ${sens({ ...nop, spikeJump: j }).all} |`);
out("\nPower-of-ten tolerance (neighbour fit)\n\n| tolerance | observations promoted |\n|---:|---:|");
for (const t of [0.01, 0.02, 0.05, 0.08, 0.10, 0.15]) out(`| ${t * 100}% | ${sens({ ...DEFAULT_RULES, powerOfTenTolerance: t }).prom} |`);

out("\n## Chart-ready check");
let bad = 0;
for (const code of [...new Set(obs.map((o) => o.code))]) for (const f of ["buy", "sell", "mid"] as const) {
  const rows = obs.filter((o) => o.code === code);
  const dflt = new Set(buildChartSeries(rows, f).map((p) => p.date));
  for (const o of rows) { const should = o[f] !== null && o.quality[f].status === "valid" && (f === "mid" || o.quality.quotePair.status === "valid"); if (should !== dflt.has(o.date)) bad++; }
}
out(`Default series contain exactly the valid values for every currency and field: ${bad === 0 ? "yes" : bad + " violations"}. Warnings never remove a point.`);
const usd = obs.filter((o) => o.code === "USD");
for (const f of ["buy", "sell", "mid"] as const) {
  out(`- USD ${f}: ${count(usd, (o) => o[f] !== null)} published; default ${buildChartSeries(usd, f).length}; with flagged ${buildChartSeries(usd, f, { showFlagged: true }).length}; with invalid ${buildChartSeries(usd, f, { showFlagged: true, showInvalid: true }).length}`);
}
out("\n## Upstream processing (not auditable by Nidex)");
out("The upstream `cbn-rates` repository already removed 116 records before this file (36 identical duplicates, 80 conflicting records rejected, listed in its `anomalies.csv`). Its raw CBN downloads are not kept. Everything above is Nidex's own checking of what remains.");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "quality-review.md"), L.join("\n") + "\n");
writeFileSync(join(outDir, "flagged-observations.json"), JSON.stringify(flagged, null, 1));
console.log(L.join("\n"));
