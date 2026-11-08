/**
 * Download the CBN Treasury bills (NTB) feed, check it, and publish public/data/treasury-bills/latest.json.
 *
 *   npx tsx scripts/fetch-ntb.ts                         download from CBN and publish
 *   npx tsx scripts/fetch-ntb.ts --dry-run               do everything except write the file
 *   npx tsx scripts/fetch-ntb.ts --from-file ntb.json --out tmp/latest.json    test with a saved download
 *
 * Options:
 *   --out <path>            where to publish (default public/data/treasury-bills/latest.json)
 *   --source-url <url>      the CBN endpoint (default below)
 *   --from-file <path>      read the response from a file instead of downloading (needs --out, testing only)
 *   --dry-run               check everything, write nothing
 *   --allow-regression      accept a download with fewer records or an older newest auction than the last good file
 *
 * Exit code 0: published, or nothing had changed. Exit code 1: refused or failed. The last good file is
 * never changed by a refused or failed run. This script does not import anything from the website.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { downloadText, planPublication, PublishRefusal, verifyPublished, writeFileAtomic } from "../src/lib/data/treasury-bills/publish";

/** The CBN endpoint. Confirm this against the URL you used with curl on 7 Nov 2026. */
const DEFAULT_ENDPOINT = "https://www.cbn.gov.ng/api/GetAllSecuritiesNTB";
const DEFAULT_OUT = "public/data/treasury-bills/latest.json";

interface Args {
  out: string;
  outGiven: boolean;
  sourceUrl: string;
  fromFile: string | null;
  dryRun: boolean;
  allowRegression: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: DEFAULT_OUT, outGiven: false, sourceUrl: DEFAULT_ENDPOINT, fromFile: null, dryRun: false, allowRegression: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value.`);
      return v;
    };
    if (a === "--out") {
      args.out = value();
      args.outGiven = true;
    } else if (a === "--source-url") args.sourceUrl = value();
    else if (a === "--from-file") args.fromFile = value();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--allow-regression") args.allowRegression = true;
    else throw new Error(`Unknown option ${a}.`);
  }
  if (args.fromFile !== null && !args.outGiven) {
    throw new Error("--from-file is for testing and needs an explicit --out, so test data is never published by accident.");
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = path.resolve(args.out);
  const previousText = existsSync(out) ? readFileSync(out, "utf8") : null;

  // 1. Get the response text (download, or a saved file for testing).
  const fetchedAt = new Date().toISOString();
  const origin = args.fromFile === null ? "network" : "file";
  const endpoint = args.fromFile === null ? args.sourceUrl : `file:${path.basename(args.fromFile)}`;
  const text = args.fromFile === null ? await downloadText({ url: args.sourceUrl }) : readFileSync(args.fromFile, "utf8");

  // 2. Decide what to publish. Pure: any problem throws here, before anything is written.
  const plan = planPublication({ text, fetchedAt, endpoint, origin, previousText, allowRegression: args.allowRegression });
  const s = plan.document.summary;
  const line = (label: string, value: string | number) => console.log(`  ${label.padEnd(26)} ${value}`);

  console.log(`Records received          ${plan.document.source.recordCount}`);
  line("Observations", s.observations);
  line("Rejected (kept on file)", s.rejected);
  line("All fields valid", s.recordsByWorstStatus.valid);
  line("Some field suspicious", s.recordsByWorstStatus.suspicious);
  line("Some field invalid", s.recordsByWorstStatus.invalid);
  line("Auction dates", `${plan.document.source.firstAuctionDate} to ${plan.document.source.lastAuctionDate}`);
  line("Rules version", plan.document.rulesVersion);
  if (plan.previous) {
    line("Last good file", `${plan.previous.source.recordCount} records, newest auction ${plan.previous.source.lastAuctionDate}, rules ${plan.previous.rulesVersion}`);
  }

  if (plan.action === "unchanged") {
    console.log("\nNo change: the data and the rules are the same as in the published file. Nothing was written.");
    console.log("RESULT=unchanged");
    return;
  }

  // 3. Write it, all or nothing.
  if (args.dryRun) {
    console.log(`\nDry run: would publish ${plan.serialized.length.toLocaleString("en-US")} characters to ${args.out}. Nothing was written.`);
    console.log("RESULT=dry-run");
    return;
  }
  writeFileAtomic(out, plan.serialized, (written) => verifyPublished(written, plan.document.source.contentSha256));
  console.log(`\nPublished ${args.out}`);
  console.log("RESULT=published");
}

main().catch((error: unknown) => {
  if (error instanceof PublishRefusal) {
    console.error(`\nREFUSED (${error.code}): ${error.message}`);
    console.error("The last good file was not changed.");
  } else {
    console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
    console.error("The last good file was not changed.");
  }
  console.error("RESULT=failed");
  process.exitCode = 1;
});